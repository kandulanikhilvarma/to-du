// Data layer for the responder console.
//
// Called by: components/console.tsx (only consumer).
// With Supabase env vars set, a signed-in responder reads the real
// `responder_events` view, which RLS scopes to events from people who invited
// them and whose invitation they accepted. Without env vars the console shows
// deterministic sample events and labels itself as demo; it never substitutes
// demo data for a configured project.

import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";

export type SosState = "broadcasting" | "acknowledged" | "enroute" | "resolved";

/** Which rung of the offline ladder actually delivered this event. */
export type Transport = "realtime" | "sms" | "ble" | "voice" | "dial112";

export type ResponderStatus = "notified" | "acknowledged" | "enroute" | "arrived";

/** Demo entries carry sample text; live entries are built from typed data
 *  so the console can render them in the viewer language. */
export type TimelineEntry = {
  minutesAgo: number;
  label?: string;
  ping?: { accuracy: number };
  ack?: { name: string; status: ResponderStatus };
  transport?: Transport;
};

export type Responder = {
  name: string;
  relationship?: string;
  status: ResponderStatus;
  etaMinutes?: number;
};

export type MedicalProfile = {
  bloodGroup: string;
  allergies: string;
  medications: string;
};

export type SosEvent = {
  id: string;
  personName: string;
  personInitials: string;
  state: SosState;
  openedMinutesAgo: number;
  /** Null until the phone has sent a fix, and for battery until it is known.
   *  The console says "unknown" rather than inventing 0,0 or 0%. */
  lastPingMinutesAgo: number | null;
  batteryPercent: number | null;
  accuracyMetres: number | null;
  lat: number | null;
  lng: number | null;
  /** Empty when there is neither a place name nor a fix. */
  placeLabel: string;
  transport: Transport;
  medical: MedicalProfile;
  responders: Responder[];
  timeline: TimelineEntry[];
  /** Signed, one-hour links to evidence photos from the phone. */
  photos?: string[];
};

export type EventSource = "live" | "demo";

export type ConsoleData = {
  source: EventSource;
  events: SosEvent[];
};

export type LivePing = { lat: number; lng: number; accuracy: number | null };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function hasSupabaseConfig(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}

export function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
}

/** India-first E.164, matching the mobile app rules. */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return null;
}

/* ---------------------------------------------------------------- auth -- */

export async function currentUser(): Promise<{ id: string; phone: string } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  return user ? { id: user.id, phone: user.phone ?? "" } : null;
}

export function onAuthChange(callback: () => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange(() => callback());
  return () => data.subscription.unsubscribe();
}

export async function sendOtp(phone: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return "not configured";
  const { error } = await supabase.auth.signInWithOtp({ phone });
  return error ? error.message : null;
}

export async function verifyOtp(phone: string, token: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return "not configured";
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  return error ? error.message : null;
}

export async function signOut(): Promise<void> {
  await getSupabase()?.auth.signOut();
}

/* -------------------------------------------------------------- events -- */

/** Row shape of the `responder_events` view (supabase migration 0004). */
type EventRow = {
  id: string;
  person_name: string;
  state: SosState;
  opened_minutes_ago: number;
  last_ping_minutes_ago: number | null;
  battery_percent: number | null;
  accuracy_metres: number | null;
  lat: number | null;
  lng: number | null;
  place_label: string | null;
  transport: Transport;
  blood_group: string | null;
  allergies: string | null;
  medications: string | null;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function rowToEvent(row: EventRow): SosEvent {
  // Before migration 0010 the view filled a missing fix with 0,0 and zeros;
  // nobody raises an SOS from that exact point in the Atlantic.
  const located = row.lat !== null && row.lng !== null && !(row.lat === 0 && row.lng === 0);
  return {
    id: row.id,
    personName: row.person_name,
    personInitials: initials(row.person_name),
    state: row.state,
    openedMinutesAgo: row.opened_minutes_ago,
    lastPingMinutesAgo: located ? row.last_ping_minutes_ago : null,
    batteryPercent: row.battery_percent || null,
    accuracyMetres: located ? row.accuracy_metres : null,
    lat: located ? row.lat : null,
    lng: located ? row.lng : null,
    placeLabel:
      row.place_label ??
      (located && row.lat !== null && row.lng !== null
        ? `${row.lat.toFixed(4)}, ${row.lng.toFixed(4)}`
        : ""),
    transport: row.transport,
    medical: {
      bloodGroup: row.blood_group ?? "",
      allergies: row.allergies ?? "",
      medications: row.medications ?? "",
    },
    responders: [],
    timeline: [],
  };
}

export async function loadEvents(): Promise<ConsoleData> {
  const supabase = getSupabase();
  if (!supabase) return { source: "demo", events: demoEvents() };

  const { data, error } = await supabase
    .from("responder_events")
    .select("*")
    .order("opened_minutes_ago", { ascending: true });

  // A configured project that errors must surface as an error, never as demo
  // data dressed up as live data.
  if (error) throw new Error(`Supabase query failed: ${error.message}`);

  return { source: "live", events: (data as EventRow[]).map(rowToEvent) };
}

type ResponderRow = {
  name: string | null;
  status: ResponderStatus;
  eta_minutes: number | null;
  updated_at: string;
};

type PingRow = {
  ts: string;
  accuracy_metres: number | null;
  transport: Transport;
};

/** Who is coming, plus the breadcrumb trail, for one live event. */
export async function loadEventDetail(
  eventId: string,
): Promise<{ responders: Responder[]; timeline: TimelineEntry[]; photos: string[] }> {
  const supabase = getSupabase();
  if (!supabase) return { responders: [], timeline: [], photos: [] };

  const [acks, pings, evidence] = await Promise.all([
    supabase.rpc("event_responders", { target: eventId }),
    supabase
      .from("location_pings")
      .select("ts, accuracy_metres, transport")
      .eq("event_id", eventId)
      .order("ts", { ascending: false })
      .limit(30),
    supabase
      .from("evidence_media")
      .select("storage_path")
      .eq("event_id", eventId)
      .order("captured_at", { ascending: true }),
  ]);
  if (acks.error) throw new Error(acks.error.message);
  if (pings.error) throw new Error(pings.error.message);

  const ackRows = acks.data as ResponderRow[];
  const responders: Responder[] = ackRows.map((r) => ({
    name: r.name ?? "",
    status: r.status,
    etaMinutes: r.eta_minutes ?? undefined,
  }));

  const timeline: TimelineEntry[] = [
    ...(pings.data as PingRow[]).map((p) => ({
      minutesAgo: minutesSince(p.ts),
      ping: { accuracy: Math.round(p.accuracy_metres ?? 0) },
      transport: p.transport,
    })),
    ...ackRows.map((r) => ({
      minutesAgo: minutesSince(r.updated_at),
      ack: { name: r.name ?? "", status: r.status },
    })),
  ].sort((a, b) => b.minutesAgo - a.minutesAgo);

  // RLS on evidence_media and on the private bucket both limit this to the
  // owner and their circle; the links expire after an hour.
  const paths = ((evidence.data ?? []) as { storage_path: string }[]).map((r) => r.storage_path);
  const signed = paths.length
    ? await supabase.storage.from("evidence").createSignedUrls(paths, 3600)
    : { data: [] };
  const photos = (signed.data ?? [])
    .map((s) => s.signedUrl)
    .filter((url): url is string => Boolean(url));

  return { responders, timeline, photos };
}

export async function acknowledge(
  eventId: string,
  status: "enroute" | "arrived",
  etaMinutes: number | null,
): Promise<string | null> {
  const supabase = getSupabase();
  const user = await currentUser();
  if (!supabase || !user) return "not signed in";
  // responder_id must be the caller: RLS rejects anything else (migration 0005).
  const { error } = await supabase.from("acknowledgements").insert({
    event_id: eventId,
    responder_id: user.id,
    status,
    eta_minutes: etaMinutes,
  });
  return error ? error.message : null;
}

/** Live pings on the private `sos:<id>` channel. Returns an unsubscribe. */
export function subscribeToEvent(
  eventId: string,
  onPing: (ping: LivePing) => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => undefined;
  const channel: RealtimeChannel = supabase
    .channel(`sos:${eventId}`, { config: { private: true } })
    .on("broadcast", { event: "ping" }, ({ payload }) => onPing(payload as LivePing))
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/* ---------------------------------------------------------------- demo -- */

export function demoEvents(): SosEvent[] {
  return [
    {
      id: "evt_7f31a2",
      personName: "Sravani Reddy",
      personInitials: "SR",
      state: "enroute",
      openedMinutesAgo: 6,
      lastPingMinutesAgo: 0,
      batteryPercent: 38,
      accuracyMetres: 12,
      lat: 17.4401,
      lng: 78.3489,
      placeLabel: "Near Hitec City MMTS, Hyderabad",
      transport: "realtime",
      medical: {
        bloodGroup: "O positive",
        allergies: "Penicillin",
        medications: "Salbutamol inhaler",
      },
      responders: [
        { name: "Anil Reddy", relationship: "Father", status: "enroute", etaMinutes: 7 },
        { name: "Divya K", relationship: "Friend", status: "acknowledged" },
        { name: "Rahul M", relationship: "Colleague", status: "notified" },
      ],
      timeline: [
        { minutesAgo: 6, label: "SOS triggered from home screen widget" },
        { minutesAgo: 6, label: "Countdown elapsed, broadcasting" },
        { minutesAgo: 5, label: "Circle notified", transport: "realtime" },
        { minutesAgo: 5, label: "SMS sent to 3 contacts", transport: "sms" },
        { minutesAgo: 4, ack: { name: "Anil Reddy", status: "acknowledged" } },
        { minutesAgo: 3, ack: { name: "Anil Reddy", status: "enroute" } },
        { minutesAgo: 0, ping: { accuracy: 12 }, transport: "realtime" },
      ],
    },
    {
      id: "evt_2c90b4",
      personName: "Meera Nair",
      personInitials: "MN",
      state: "broadcasting",
      openedMinutesAgo: 2,
      lastPingMinutesAgo: 2,
      batteryPercent: 9,
      accuracyMetres: 65,
      lat: 17.3616,
      lng: 78.4747,
      placeLabel: "Charminar area, Hyderabad",
      transport: "sms",
      medical: {
        bloodGroup: "A negative",
        allergies: "",
        medications: "",
      },
      responders: [
        { name: "Priya Nair", relationship: "Sister", status: "notified" },
        { name: "Vikram S", relationship: "Neighbour", status: "notified" },
      ],
      timeline: [
        { minutesAgo: 2, label: "SOS triggered, no mobile data" },
        { minutesAgo: 2, label: "Event saved on the phone" },
        { minutesAgo: 2, label: "SMS composer sent to 2 contacts", transport: "sms" },
        { minutesAgo: 2, label: "Low battery, final location pinned" },
      ],
    },
    {
      id: "evt_a18e55",
      personName: "Karthik Rao",
      personInitials: "KR",
      state: "acknowledged",
      openedMinutesAgo: 14,
      lastPingMinutesAgo: 1,
      batteryPercent: 72,
      accuracyMetres: 8,
      lat: 17.4239,
      lng: 78.4738,
      placeLabel: "Necklace Road, Hyderabad",
      transport: "realtime",
      medical: {
        bloodGroup: "B positive",
        allergies: "Sulfa drugs",
        medications: "Metformin",
      },
      responders: [{ name: "Sunita Rao", relationship: "Mother", status: "acknowledged" }],
      timeline: [
        { minutesAgo: 14, label: "SOS triggered from the Quick Settings tile" },
        { minutesAgo: 14, label: "Countdown elapsed, broadcasting" },
        { minutesAgo: 13, label: "SMS composer sent to 2 contacts", transport: "sms" },
        { minutesAgo: 11, ack: { name: "Sunita Rao", status: "acknowledged" } },
        { minutesAgo: 1, ping: { accuracy: 8 }, transport: "realtime" },
      ],
    },
    {
      id: "evt_53dd10",
      personName: "Fatima Begum",
      personInitials: "FB",
      state: "resolved",
      openedMinutesAgo: 51,
      lastPingMinutesAgo: 38,
      batteryPercent: 55,
      accuracyMetres: 20,
      lat: 17.4486,
      lng: 78.3908,
      placeLabel: "Jubilee Hills, Hyderabad",
      transport: "sms",
      medical: {
        bloodGroup: "AB positive",
        allergies: "Latex",
        medications: "",
      },
      responders: [{ name: "Imran Begum", relationship: "Brother", status: "arrived" }],
      timeline: [
        { minutesAgo: 51, label: "SOS triggered from the SOS button" },
        { minutesAgo: 50, label: "SMS composer sent to 2 contacts", transport: "sms" },
        { minutesAgo: 44, ack: { name: "Imran Begum", status: "arrived" } },
        { minutesAgo: 38, label: "Marked safe by Fatima Begum" },
      ],
    },
  ];
}

/* ------------------------------------------------------------- invites -- */

export type Invite = { connectionId: string; ownerName: string };

/** Invitations waiting for this responder, and the people they already
 *  respond for. Both come from security-definer functions scoped to the
 *  caller (supabase migration 0006). */
export async function loadInvites(): Promise<{ pending: Invite[]; respondingFor: string[] }> {
  const supabase = getSupabase();
  if (!supabase) return { pending: [], respondingFor: [] };
  const [pending, active] = await Promise.all([
    supabase.rpc("my_invites"),
    supabase.rpc("responding_for"),
  ]);
  return {
    pending: ((pending.data ?? []) as { connection_id: string; owner_name: string }[]).map((r) => ({
      connectionId: r.connection_id,
      ownerName: r.owner_name,
    })),
    respondingFor: ((active.data ?? []) as { owner_name: string }[]).map((r) => r.owner_name),
  };
}

export async function answerInvite(connectionId: string, accept: boolean): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return "not configured";
  const { error } = await supabase
    .from("connections")
    .update({ status: accept ? "active" : "revoked" })
    .eq("id", connectionId);
  return error ? error.message : null;
}
