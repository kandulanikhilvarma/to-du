// sos-fanout: alerts an owner circle when an SOS opens or is resolved.
//
// Called by the database trigger in migration 0006 (with the service role key)
// and by the owner app. Idempotent: the first caller claims the event through
// fanned_out_at / resolve_notified_at, later calls return { duplicate: true }.
//
// Environment:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   provided by Supabase
//   TODU_CONSOLE_URL                          responder console link
//   EXPO_ACCESS_TOKEN                         optional, if push security is on
//   MSG91_AUTH_KEY                            MSG91 account key
//   MSG91_SOS_TEMPLATE_ID                     DLT template for an open SOS
//   MSG91_SAFE_TEMPLATE_ID                    DLT template for "marked safe"
//   MSG91_NAME_VAR, MSG91_LINK_VAR            template variable names
// Without MSG91 variables SMS is logged as skipped, never as sent.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  mapsLink,
  planDeliveries,
  sendPush,
  sendSms,
  type Delivery,
  type EventBrief,
  type Kind,
  type Msg91Config,
  type Recipient,
} from "../_shared/fanout.ts";

const env = (key: string): string => Deno.env.get(key) ?? "";

const SUPABASE_URL = env("SUPABASE_URL");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const CONSOLE_URL = env("TODU_CONSOLE_URL") || "https://todu-kandula.vercel.app/dashboard";

type EventRow = { id: string; user_id: string; state: string };
type BriefRow = { person_name: string; lat: number; lng: number };
type ProfileRow = { id: string; phone: string; display_name: string };
type DeviceRow = { user_id: string; push_token: string };
type ContactRow = { name: string; phone: string };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function msg91Config(kind: Kind): Msg91Config | null {
  const authKey = env("MSG91_AUTH_KEY");
  const templateId =
    kind === "opened" ? env("MSG91_SOS_TEMPLATE_ID") : env("MSG91_SAFE_TEMPLATE_ID");
  if (!authKey || !templateId) return null;
  return {
    authKey,
    templateId,
    nameVar: env("MSG91_NAME_VAR") || "name",
    linkVar: env("MSG91_LINK_VAR") || "link",
  };
}

/** The phone inserts the event and then its first ping. When the trigger wins
 *  that race, wait up to five seconds so the alert can carry a location. */
async function loadBrief(admin: SupabaseClient, eventId: string, kind: Kind): Promise<EventBrief> {
  let located = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    const { count } = await admin
      .from("location_pings")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId);
    located = (count ?? 0) > 0;
    if (located || kind === "resolved") break;
    await sleep(1000);
  }

  const [{ data }, { data: origin }] = await Promise.all([
    admin
      .from("responder_events")
      .select("person_name, lat, lng")
      .eq("id", eventId)
      .maybeSingle<BriefRow>(),
    admin
      .from("sos_events")
      .select("from_check_in")
      .eq("id", eventId)
      .maybeSingle<{ from_check_in: boolean }>(),
  ]);

  return {
    id: eventId,
    personName: data?.person_name ?? "",
    lat: located && data ? data.lat : null,
    lng: located && data ? data.lng : null,
    fromCheckIn: origin?.from_check_in ?? false,
  };
}

/** Active connections (push and SMS) plus emergency contacts (SMS only). */
async function loadRecipients(admin: SupabaseClient, ownerId: string): Promise<Recipient[]> {
  const { data: links } = await admin
    .from("connections")
    .select("contact_id")
    .eq("owner_id", ownerId)
    .eq("status", "active");
  const contactIds = ((links ?? []) as { contact_id: string }[]).map((l) => l.contact_id);

  const [profiles, devices, emergency] = await Promise.all([
    contactIds.length
      ? admin.from("profiles").select("id, phone, display_name").in("id", contactIds)
      : Promise.resolve({ data: [] as ProfileRow[] }),
    contactIds.length
      ? admin
          .from("devices")
          .select("user_id, push_token")
          .in("user_id", contactIds)
          .not("push_token", "is", null)
      : Promise.resolve({ data: [] as DeviceRow[] }),
    admin.from("emergency_contacts").select("name, phone").eq("owner_id", ownerId),
  ]);

  const tokensByUser = new Map<string, string[]>();
  for (const d of (devices.data ?? []) as DeviceRow[]) {
    tokensByUser.set(d.user_id, [...(tokensByUser.get(d.user_id) ?? []), d.push_token]);
  }

  return [
    ...((profiles.data ?? []) as ProfileRow[]).map((p) => ({
      name: p.display_name,
      phone: p.phone,
      pushTokens: tokensByUser.get(p.id) ?? [],
    })),
    ...((emergency.data ?? []) as ContactRow[]).map((c) => ({
      name: c.name,
      phone: c.phone,
      pushTokens: [],
    })),
  ];
}

function count(deliveries: Delivery[]) {
  return {
    sent: deliveries.filter((d) => d.status === "sent").length,
    failed: deliveries.filter((d) => d.status === "failed").length,
    skipped: deliveries.filter((d) => d.status === "skipped").length,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let input: { event_id?: unknown; kind?: unknown };
  try {
    input = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const eventId = typeof input.event_id === "string" ? input.event_id : null;
  const kind: Kind = input.kind === "resolved" ? "resolved" : "opened";
  if (!eventId) return json({ error: "event_id is required" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: event, error: eventError } = await admin
    .from("sos_events")
    .select("id, user_id, state")
    .eq("id", eventId)
    .maybeSingle<EventRow>();
  if (eventError) return json({ error: eventError.message }, 500);
  if (!event) return json({ error: "event not found" }, 404);

  // Only the database trigger (service role) or the event owner may ask.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (token !== SERVICE_KEY) {
    const { data } = await admin.auth.getUser(token);
    if (data.user?.id !== event.user_id) return json({ error: "forbidden" }, 403);
  }
  if (kind === "resolved" && event.state !== "resolved") {
    return json({ error: "event is not resolved" }, 409);
  }
  // An SOS that reached the server already over (marked safe while offline)
  // is history. The insert trigger still asks; nobody is alerted.
  if (kind === "opened" && !["broadcasting", "acknowledged", "enroute"].includes(event.state)) {
    return json({ ok: true, skipped: "event is not live" });
  }

  const claimColumn = kind === "opened" ? "fanned_out_at" : "resolve_notified_at";
  const { data: claimed, error: claimError } = await admin
    .from("sos_events")
    .update({ [claimColumn]: new Date().toISOString() })
    .eq("id", eventId)
    .is(claimColumn, null)
    .select("id");
  if (claimError) return json({ error: claimError.message }, 500);
  if (!claimed || claimed.length === 0) return json({ ok: true, duplicate: true });

  const brief = await loadBrief(admin, eventId, kind);
  const recipients = await loadRecipients(admin, event.user_id);
  const plan = planDeliveries(kind, brief, recipients, CONSOLE_URL);

  const [push, sms] = await Promise.all([
    sendPush(plan.push, fetch, env("EXPO_ACCESS_TOKEN") || undefined),
    sendSms(
      plan.sms,
      msg91Config(kind),
      { name: brief.personName || "Someone in your circle", link: mapsLink(brief) ?? CONSOLE_URL },
      fetch,
    ),
  ]);

  const deliveries = [...push.deliveries, ...sms];
  if (deliveries.length > 0) {
    await admin.from("notifications").insert(
      deliveries.map((d) => ({
        event_id: eventId,
        kind,
        channel: d.channel,
        recipient: d.recipient,
        status: d.status,
        detail: d.detail ?? null,
      })),
    );
  }
  if (push.deadTokens.length > 0) {
    await admin.from("devices").update({ push_token: null }).in("push_token", push.deadTokens);
  }

  return json({
    ok: true,
    kind,
    recipients: recipients.length,
    push: count(push.deliveries),
    sms: count(sms),
  });
});
