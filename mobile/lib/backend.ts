// Optional Supabase backend. Every SOS rung that does not need a server keeps
// working when this is unconfigured or signed out, and every function here
// reports exactly why it did not deliver.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { createMMKV } from "react-native-mmkv";
import { enqueue, flush, pending, resolvedInQueue, type QueuedItem } from "./queue";
import type { RelayPayload } from "./relay-core";
import type { Contact, Settings } from "./settings";
import type { Responder, ResponderStatus } from "./responders";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const authKv = createMMKV({ id: "todu.auth" });

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storage: {
            getItem: (key) => authKv.getString(key) ?? null,
            setItem: (key, value) => authKv.set(key, value),
            removeItem: (key) => {
              authKv.remove(key);
            },
          },
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;

export type BackendState = "unconfigured" | "signed_out" | "ready";
export type SendReason = "sent" | "unconfigured" | "signed_out" | "rejected";
export type Fix = { lat: number; lng: number; accuracy: number | null };
export type EventDraft = {
  /** Generated on the phone; makes every copy of this SOS one event. */
  clientId: string;
  fix: Fix | null;
  battery: number | null;
  silent: boolean;
  duress: boolean;
};

// The active event id is persisted: the background location task can run in a
// fresh JS context after the app is killed and must still attach its pings.
const eventKv = createMMKV({ id: "todu.event" });
const EVENT_KEY = "current";
const CLIENT_KEY = "client";

function currentEventId(): string | null {
  return eventKv.getString(EVENT_KEY) ?? null;
}

/** The phone-side id of the live SOS. Queued pings and resolves carry it so
 *  they land on their own event, whatever is current when they flush. */
export function currentClientId(): string | null {
  return eventKv.getString(CLIENT_KEY) ?? null;
}

async function eventIdFor(clientId: string): Promise<string | null> {
  if (!supabase) return null;
  if (clientId === currentClientId() && currentEventId()) return currentEventId();
  const { data } = await supabase
    .from("sos_events")
    .select("id")
    .eq("client_id", clientId)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

function setCurrentEventId(id: string | null): void {
  if (id) eventKv.set(EVENT_KEY, id);
  else eventKv.remove(EVENT_KEY);
}

export function hasBackend(): boolean {
  return supabase !== null;
}

async function userId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function backendState(): Promise<BackendState> {
  if (!supabase) return "unconfigured";
  return (await userId()) ? "ready" : "signed_out";
}

/** A new SOS must never attach pings to a previous event. */
export function beginEvent(clientId: string): void {
  setCurrentEventId(null);
  eventKv.set(CLIENT_KEY, clientId);
}

/**
 * `resolved` is for an SOS that was over before it reached the server (the
 * person marked safe while offline or signed out). It is stored as history
 * and never alerts the circle.
 */
export async function openEvent(draft: EventDraft, resolved = false): Promise<SendReason> {
  if (!supabase) return "unconfigured";
  const uid = await userId();
  if (!uid) return "signed_out";

  // Upsert on client_id: a Bluetooth relay may already have created this SOS,
  // and a retried queue flush must not create a second one.
  const { error } = await supabase.from("sos_events").upsert(
    {
      user_id: uid,
      client_id: draft.clientId,
      state: resolved ? "resolved" : "broadcasting",
      resolved_at: resolved ? new Date().toISOString() : null,
      transport: "realtime",
      battery_percent: draft.battery,
      silent: draft.silent,
      duress: draft.duress,
    },
    { onConflict: "client_id", ignoreDuplicates: true },
  );
  if (error) return "rejected";
  const { data } = await supabase
    .from("sos_events")
    .select("id")
    .eq("client_id", draft.clientId)
    .maybeSingle<{ id: string }>();
  if (!data) return "rejected";

  if (draft.clientId === currentClientId() && !resolved) setCurrentEventId(data.id);
  if (draft.fix) await sendPing(draft.fix, draft.battery, data.id);
  if (!resolved) requestFanout(data.id, "opened");
  return "sent";
}

/** Durable trail row first, then a best effort live broadcast. */
export async function sendPing(
  fix: Fix,
  battery: number | null,
  eventId: string | null = currentEventId(),
): Promise<boolean> {
  if (!supabase || !eventId) return false;
  const { error } = await supabase.from("location_pings").insert({
    event_id: eventId,
    point: `SRID=4326;POINT(${fix.lng} ${fix.lat})`,
    accuracy_metres: fix.accuracy,
    battery_percent: battery,
  });
  if (error) return false;

  // Private channel: realtime.messages RLS limits it to the owner and their
  // active connections (migration 0005).
  const channel = supabase.channel(`sos:${eventId}`, { config: { private: true } });
  await channel.httpSend("ping", { ...fix, battery }).catch(() => undefined);
  void supabase.removeChannel(channel);
  return true;
}

/** Resolve by the phone-side id, never by "whatever is current": a resolve
 *  queued for one SOS must not close a later one. False until the event row
 *  exists, so a queued resolve waits for its event. */
export async function markResolved(clientId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("sos_events")
    .update({ state: "resolved", resolved_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .select("id");
  const row = (data as { id: string }[] | null)?.[0];
  if (error || !row) return false;
  if (clientId === currentClientId()) setCurrentEventId(null);
  requestFanout(row.id, "resolved");
  return true;
}

type QueuedPing = { fix: Fix; battery: number | null; clientId?: string | null };

/** Sender used by the offline queue flush. FIFO order means an event is
 *  created before the pings queued after it. Pings and resolves from before
 *  items carried a client id cannot be placed safely, so they are dropped. */
export async function sendQueued(item: QueuedItem): Promise<boolean> {
  switch (item.kind) {
    case "event": {
      const draft = item.payload as EventDraft;
      return (await openEvent(draft, resolvedInQueue(pending(), draft.clientId))) === "sent";
    }
    case "ping": {
      const p = item.payload as QueuedPing;
      if (!p.clientId) return true;
      const eventId = await eventIdFor(p.clientId);
      return eventId ? sendPing(p.fix, p.battery, eventId) : false;
    }
    case "resolve": {
      const { clientId } = item.payload as { clientId?: string };
      return clientId ? markResolved(clientId) : true;
    }
    case "relay":
      return postRelay(item.payload as RelayPayload);
  }
}

export async function sendOtp(phone: string): Promise<string | null> {
  if (!supabase) return "unconfigured";
  const { error } = await supabase.auth.signInWithOtp({ phone });
  return error ? error.message : null;
}

export async function verifyOtp(phone: string, token: string): Promise<string | null> {
  if (!supabase) return "unconfigured";
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  return error ? error.message : null;
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

/** Mirror the local profile to the server so responders see it. */
export async function syncProfile(s: Settings): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user?.phone) return false;

  const profile = await supabase.from("profiles").upsert({
    id: user.id,
    phone: `+${user.phone.replace(/^\+/, "")}`,
    display_name: s.displayName || "Todu user",
  });
  if (profile.error) return false;

  const medical = await supabase.from("medical_profiles").upsert({
    user_id: user.id,
    blood_group: s.medical.bloodGroup || null,
    allergies: s.medical.allergies || null,
    medications: s.medical.medications || null,
    updated_at: new Date().toISOString(),
  });
  return !medical.error;
}

export type BroadcastOutcome = SendReason | "offline";

/**
 * The SOS send path. The event is written to the on-device queue before any
 * network wait, then flushed through the same serialised queue the reconnect
 * listener uses, so it can neither be lost nor sent twice.
 */
export async function broadcastEvent(
  draft: EventDraft,
  online: boolean,
): Promise<BroadcastOutcome> {
  if (!supabase) return "unconfigured";
  const item = enqueue("event", draft);
  if (!online) return "offline";
  if ((await backendState()) === "signed_out") return "signed_out";

  await flush(sendQueued);
  return pending().some((queued) => queued.id === item.id) ? "rejected" : "sent";
}

/* ----------------------------------------------------------------- fan-out -- */

/** Ask sos-fanout to alert the circle. The database trigger asks too; the
 *  function sends once, so this is a belt-and-braces call, not a retry loop. */
function requestFanout(eventId: string, kind: "opened" | "resolved"): void {
  void supabase?.functions
    .invoke("sos-fanout", { body: { event_id: eventId, kind } })
    .catch(() => undefined);
}

/* ------------------------------------------------------------------ relay -- */

const RELAY_IDENTITY = "todu.relay.identity";

export type RelayIdentity = { uid: string; secret: string };

/** Fetched while online and kept in the keystore, so a phone with no signal
 *  can still sign its own SOS for the Bluetooth mesh. */
export async function ensureRelayIdentity(): Promise<RelayIdentity | null> {
  if (!supabase) return null;
  const uid = await userId();
  if (!uid) return null;
  const { data, error } = await supabase.rpc("issue_relay_secret");
  if (error || typeof data !== "string") return relayIdentity();
  const identity = { uid, secret: data };
  await SecureStore.setItemAsync(RELAY_IDENTITY, JSON.stringify(identity));
  return identity;
}

export async function relayIdentity(): Promise<RelayIdentity | null> {
  const raw = await SecureStore.getItemAsync(RELAY_IDENTITY).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RelayIdentity;
  } catch {
    return null;
  }
}

/** Hand an alert heard over Bluetooth to the server. Needs a signed-in
 *  session on this (relaying) phone; the payload carries its own signature. */
export async function postRelay(payload: RelayPayload): Promise<boolean> {
  if (!supabase || !(await userId())) return false;
  const { error } = await supabase.functions.invoke("sos-relay", { body: payload });
  return !error;
}

/* --------------------------------------------------------- contacts, push -- */

/** Mirror the phone contact list so the server can text people without Todu. */
export async function syncEmergencyContacts(contacts: Contact[]): Promise<boolean> {
  if (!supabase) return false;
  const uid = await userId();
  if (!uid) return false;
  const removed = await supabase.from("emergency_contacts").delete().eq("owner_id", uid);
  if (removed.error) return false;
  if (contacts.length === 0) return true;
  const { error } = await supabase
    .from("emergency_contacts")
    .insert(contacts.map((c) => ({ owner_id: uid, name: c.name, phone: c.phone })));
  return !error;
}

export async function registerPushToken(
  token: string,
  platform: string,
  model: string | null,
): Promise<boolean> {
  if (!supabase) return false;
  const uid = await userId();
  if (!uid) return false;
  const { error } = await supabase.from("devices").upsert(
    {
      user_id: uid,
      platform,
      model,
      push_token: token,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "push_token" },
  );
  return !error;
}

/* ---------------------------------------------------------------- invites -- */

export type CircleStatus = { phone: string; status: "pending" | "active" };
export type Invite = { connectionId: string; ownerName: string };

export async function inviteContact(phone: string): Promise<string | null> {
  if (!supabase) return "unconfigured";
  const { error } = await supabase.rpc("invite_contact", { contact_phone: phone });
  return error ? error.message : null;
}

export async function revokeContact(phone: string): Promise<void> {
  await supabase?.rpc("revoke_contact", { contact_phone: phone });
}

export async function myCircle(): Promise<CircleStatus[]> {
  if (!supabase) return [];
  const { data } = await supabase.rpc("my_circle");
  return ((data ?? []) as { phone: string; status: string }[]).map((r) => ({
    phone: r.phone,
    status: r.status === "active" ? "active" : "pending",
  }));
}

export async function myInvites(): Promise<Invite[]> {
  if (!supabase) return [];
  const { data } = await supabase.rpc("my_invites");
  return ((data ?? []) as { connection_id: string; owner_name: string }[]).map((r) => ({
    connectionId: r.connection_id,
    ownerName: r.owner_name,
  }));
}

export async function respondingFor(): Promise<string[]> {
  if (!supabase) return [];
  const { data } = await supabase.rpc("responding_for");
  return ((data ?? []) as { owner_name: string }[]).map((r) => r.owner_name);
}

/** Accept or decline an invite. RLS lets only the invited contact do this. */
export async function answerInvite(connectionId: string, accept: boolean): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from("connections")
    .update({ status: accept ? "active" : "revoked" })
    .eq("id", connectionId);
  return !error;
}

/** Who has answered the live SOS: each responder's latest status and ETA.
 *  RLS inside event_responders limits this to the owner and their circle. */
export async function eventResponders(
  eventId: string | null = currentEventId(),
): Promise<Responder[]> {
  if (!supabase || !eventId) return [];
  const { data } = await supabase.rpc("event_responders", { target: eventId });
  return (
    (data ?? []) as { name: string | null; status: ResponderStatus; eta_minutes: number | null }[]
  ).map((r) => ({ name: r.name ?? "", status: r.status, etaMinutes: r.eta_minutes }));
}

/** Upload an evidence photo for the live event. Returns null on success or a
 *  plain reason; the file stays in the app cache if it could not go. */
export async function uploadEvidence(uri: string): Promise<string | null> {
  const uid = await userId();
  const eventId = currentEventId();
  if (!supabase || !uid) return "not signed in";
  if (!eventId) return "the alert has not reached the server yet";
  const path = `${uid}/${eventId}/${Date.now()}.jpg`;
  const body = await (await fetch(uri)).arrayBuffer();
  const { error } = await supabase.storage
    .from("evidence")
    .upload(path, body, { contentType: "image/jpeg" });
  if (error) return error.message;
  const { error: rowError } = await supabase
    .from("evidence_media")
    .insert({ event_id: eventId, storage_path: path, kind: "photo" });
  return rowError ? rowError.message : null;
}

/** Mirror the check-in deadline to the server (null clears it). Returns
 *  whether the server now matches, false when signed out or offline. */
export async function setServerCheckIn(deadline: number | null): Promise<boolean> {
  const uid = await userId();
  if (!supabase || !uid) return false;
  const { error } =
    deadline === null
      ? await supabase.from("check_ins").delete().eq("user_id", uid)
      : await supabase
          .from("check_ins")
          .upsert({ user_id: uid, deadline: new Date(deadline).toISOString() });
  return !error;
}

export async function isSignedIn(): Promise<boolean> {
  return (await userId()) !== null;
}
