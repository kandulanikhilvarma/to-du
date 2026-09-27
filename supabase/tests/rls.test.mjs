// Applies every migration to a real Postgres (PGlite, with PostGIS) and checks
// the row level security from the point of view of three users:
//   A  owns an SOS event
//   B  is invited by A as a responder
//   C  is a stranger
// Supabase supplies auth.uid(), realtime.topic() and the API roles around a
// project; the prelude below stands those in with the same semantics.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { postgis } from "@electric-sql/pglite-postgis";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const C = "00000000-0000-0000-0000-00000000000c";

const PRELUDE = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create schema realtime;
  create table realtime.messages (
    id bigserial primary key,
    topic text not null,
    extension text not null,
    payload jsonb
  );
  alter table realtime.messages enable row level security;
  create function realtime.topic() returns text language sql stable as $$
    select current_setting('realtime.topic', true)
  $$;
`;

// Mirrors the default privileges Supabase grants to its API roles. Applied
// before the migrations, as on Supabase, so a migration that revokes a grant
// is tested with the revoke in force.
const GRANTS = `
  grant usage on schema public, auth, realtime to anon, authenticated;
  alter default privileges in schema public
    grant select, insert, update, delete on tables to anon, authenticated;
  alter default privileges in schema public
    grant usage, select on sequences to authenticated;
  alter default privileges in schema public
    grant execute on functions to anon, authenticated;
  grant execute on all functions in schema auth, realtime to anon, authenticated;
  grant select, insert on realtime.messages to authenticated;
  grant usage, select on all sequences in schema realtime to authenticated;
`;

let db;
let eventId;

/** Run one statement as a signed-in user, inside its own transaction. */
function as(uid, sql, params = [], topic = "") {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    await tx.query("select set_config('realtime.topic', $1, true)", [topic]);
    await tx.exec("set local role authenticated");
    return tx.query(sql, params);
  });
}

before(async () => {
  db = await PGlite.create({ extensions: { postgis, uuid_ossp } });
  await db.exec(PRELUDE);
  await db.exec(GRANTS);

  const dir = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8"));
  }

  await db.query("insert into auth.users values ($1), ($2), ($3)", [A, B, C]);
  await db.query(
    `insert into profiles (id, phone, display_name) values
       ($1, '+910000000001', 'Asha'),
       ($2, '+910000000002', 'Bala'),
       ($3, '+910000000003', 'Chitra')`,
    [A, B, C],
  );
  await db.query(
    "insert into medical_profiles (user_id, blood_group) values ($1, 'O positive')",
    [A],
  );

  const created = await as(
    A,
    `insert into sos_events (user_id, battery_percent) values ($1, 40) returning id`,
    [A],
  );
  eventId = created.rows[0].id;
  await as(
    A,
    `insert into location_pings (event_id, point, accuracy_metres)
     values ($1, 'SRID=4326;POINT(78.3489 17.4401)', 12)`,
    [eventId],
  );
});

test("an owner cannot enrol a contact as already active", async () => {
  await as(
    A,
    "insert into connections (owner_id, contact_id, status) values ($1, $2, 'active')",
    [A, B],
  );
  const row = await db.query("select status from connections where owner_id = $1", [A]);
  assert.equal(row.rows[0].status, "pending");
});

test("a pending contact sees nothing of the owner event", async () => {
  const seen = await as(B, "select id from sos_events");
  assert.equal(seen.rows.length, 0);
});

test("the owner cannot accept on the contact behalf", async () => {
  await assert.rejects(
    as(A, "update connections set status = 'active' where owner_id = $1", [A]),
    /only the invited contact/,
  );
});

test("the contact can accept, and then sees the event", async () => {
  await as(B, "update connections set status = 'active' where contact_id = $1", [B]);
  const seen = await as(B, "select id from sos_events");
  assert.deepEqual(
    seen.rows.map((r) => r.id),
    [eventId],
  );
});

test("a contact cannot repoint a connection at someone else", async () => {
  await assert.rejects(
    as(B, "update connections set owner_id = $1 where contact_id = $2", [C, B]),
    /endpoints cannot change/,
  );
});

test("a stranger sees no events, pings, medical data or profiles", async () => {
  for (const table of ["sos_events", "location_pings", "medical_profiles"]) {
    const seen = await as(C, `select 1 from ${table}`);
    assert.equal(seen.rows.length, 0, table);
  }
  const profiles = await as(C, "select id from profiles");
  assert.deepEqual(
    profiles.rows.map((r) => r.id),
    [C],
  );
});

test("the responder view gives the contact location and medical data", async () => {
  const view = await as(B, "select * from responder_events");
  assert.equal(view.rows.length, 1);
  const row = view.rows[0];
  assert.equal(row.person_name, "Asha");
  assert.equal(row.blood_group, "O positive");
  assert.ok(Math.abs(row.lat - 17.4401) < 1e-6 && Math.abs(row.lng - 78.3489) < 1e-6);

  const stranger = await as(C, "select * from responder_events");
  assert.equal(stranger.rows.length, 0);
});

test("the responder view never lists the viewer's own alerts", async () => {
  const own = await as(A, "select * from responder_events");
  assert.equal(own.rows.length, 0);
});

test("an alert with no fix yet reports unknown, not 0,0 and 0%", async () => {
  const bare = await db.query(
    "insert into sos_events (user_id) values ($1) returning id",
    [A],
  );
  const id = bare.rows[0].id;
  try {
    const view = await as(B, "select * from responder_events where id = $1", [id]);
    const row = view.rows[0];
    assert.equal(row.lat, null);
    assert.equal(row.lng, null);
    assert.equal(row.battery_percent, null);
    assert.equal(row.last_ping_minutes_ago, null);
  } finally {
    await db.query("delete from sos_events where id = $1", [id]);
  }
});

test("a responder cannot acknowledge in another user name", async () => {
  await assert.rejects(
    as(
      B,
      "insert into acknowledgements (event_id, responder_id, status) values ($1, $2, 'enroute')",
      [eventId, C],
    ),
    /row-level security/,
  );
});

test("a responder can acknowledge as themselves; a stranger cannot", async () => {
  await as(
    B,
    `insert into acknowledgements (event_id, responder_id, status, eta_minutes)
     values ($1, $2, 'enroute', 7)`,
    [eventId, B],
  );
  await assert.rejects(
    as(
      C,
      "insert into acknowledgements (event_id, responder_id, status) values ($1, $2, 'enroute')",
      [eventId, C],
    ),
    /row-level security/,
  );
});

test("event_responders names who is coming, only to entitled viewers", async () => {
  const owner = await as(A, "select * from event_responders($1)", [eventId]);
  assert.deepEqual(
    owner.rows.map((r) => [r.name, r.status, r.eta_minutes]),
    [["Bala", "enroute", 7]],
  );
  const stranger = await as(C, "select * from event_responders($1)", [eventId]);
  assert.equal(stranger.rows.length, 0);
});

test("only the owner can add pings or evidence", async () => {
  await assert.rejects(
    as(
      B,
      "insert into location_pings (event_id, point) values ($1, 'SRID=4326;POINT(78 17)')",
      [eventId],
    ),
    /row-level security/,
  );
  await assert.rejects(
    as(
      B,
      "insert into evidence_media (event_id, storage_path, kind) values ($1, 'x', 'photo')",
      [eventId],
    ),
    /row-level security/,
  );
  await as(
    A,
    "insert into evidence_media (event_id, storage_path, kind) values ($1, 'a.jpg', 'photo')",
    [eventId],
  );
});

test("a responder cannot mark the owner safe", async () => {
  const updated = await as(
    B,
    "update sos_events set state = 'resolved' where id = $1 returning id",
    [eventId],
  );
  assert.equal(updated.rows.length, 0);
});

test("private realtime channel: owner sends, contact reads, stranger does not", async () => {
  const topic = `sos:${eventId}`;
  await as(
    A,
    "insert into realtime.messages (topic, extension, payload) values ($1, 'broadcast', '{}')",
    [topic],
    topic,
  );
  await assert.rejects(
    as(
      B,
      "insert into realtime.messages (topic, extension, payload) values ($1, 'broadcast', '{}')",
      [topic],
      topic,
    ),
    /row-level security/,
  );
  const contact = await as(B, "select id from realtime.messages", [], topic);
  assert.equal(contact.rows.length, 1);
  const stranger = await as(C, "select id from realtime.messages", [], topic);
  assert.equal(stranger.rows.length, 0);
});

test("the waitlist is not readable through the API", async () => {
  await db.query("insert into waitlist (email) values ('someone@example.com')");
  const seen = await as(C, "select email from waitlist");
  assert.equal(seen.rows.length, 0);
});

test("the nearby_responders function is gone", async () => {
  const found = await db.query("select 1 from pg_proc where proname = 'nearby_responders'");
  assert.equal(found.rows.length, 0);
});

/* ------------------------------------------------ 0006: invites & fan-out -- */

const D = "00000000-0000-0000-0000-00000000000d";
const UNREGISTERED = "+910000000009";

test("inviting never reveals whether a number is on Todu", async () => {
  const onTodu = await as(A, "select invite_contact($1, 'Friend') as r", ["+910000000003"]);
  const notOnTodu = await as(A, "select invite_contact($1, 'Cousin') as r", [UNREGISTERED]);
  assert.equal(onTodu.rows[0].r, "sent");
  assert.equal(notOnTodu.rows[0].r, "sent");

  const circle = await as(A, "select phone, status from my_circle() order by phone");
  const statuses = Object.fromEntries(circle.rows.map((r) => [r.phone, r.status]));
  assert.equal(statuses["+910000000003"], "pending");
  assert.equal(statuses[UNREGISTERED], "pending");
});

test("the invited Todu user sees who invited them, and can accept", async () => {
  const invites = await as(C, "select connection_id, owner_name from my_invites()");
  assert.deepEqual(
    invites.rows.map((r) => r.owner_name),
    ["Asha"],
  );
  await as(C, "update connections set status = 'active' where id = $1", [
    invites.rows[0].connection_id,
  ]);
  const responding = await as(C, "select owner_name from responding_for()");
  assert.deepEqual(
    responding.rows.map((r) => r.owner_name),
    ["Asha"],
  );
  const seen = await as(C, "select id from sos_events");
  assert.equal(seen.rows.length, 1);
});

test("an invite to an unregistered number is claimed at sign up", async () => {
  await db.query("insert into auth.users values ($1)", [D]);
  await db.query(
    "insert into profiles (id, phone, display_name) values ($1, $2, 'Dev')",
    [D, UNREGISTERED],
  );
  const invites = await as(D, "select owner_name, relationship from my_invites()");
  assert.deepEqual(invites.rows, [{ owner_name: "Asha", relationship: "Cousin" }]);
  const left = await db.query("select 1 from pending_invites where phone = $1", [UNREGISTERED]);
  assert.equal(left.rows.length, 0);
});

test("the owner can revoke, and the revoked contact loses access", async () => {
  await as(A, "select revoke_contact($1)", ["+910000000003"]);
  const seen = await as(C, "select id from sos_events");
  assert.equal(seen.rows.length, 0);
  const circle = await as(A, "select phone from my_circle()");
  assert.ok(!circle.rows.some((r) => r.phone === "+910000000003"));
});

test("emergency contacts are private to their owner", async () => {
  await as(
    A,
    "insert into emergency_contacts (owner_id, name, phone) values ($1, 'Amma', '+919999999999')",
    [A],
  );
  assert.equal((await as(A, "select 1 from emergency_contacts")).rows.length, 1);
  assert.equal((await as(B, "select 1 from emergency_contacts")).rows.length, 0);
  await assert.rejects(
    as(
      B,
      "insert into emergency_contacts (owner_id, name, phone) values ($1, 'x', '+911111111111')",
      [A],
    ),
    /row-level security/,
  );
});

test("a relay secret is stable per user and unreadable by others", async () => {
  const first = (await as(A, "select issue_relay_secret() as s")).rows[0].s;
  const second = (await as(A, "select issue_relay_secret() as s")).rows[0].s;
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
  const other = (await as(B, "select issue_relay_secret() as s")).rows[0].s;
  assert.notEqual(other, first);
  assert.equal((await as(B, "select 1 from relay_secrets")).rows.length, 0);
});

test("the same client_id cannot create two events", async () => {
  const cid = "11111111-1111-4111-8111-111111111111";
  await as(A, "insert into sos_events (user_id, client_id) values ($1, $2)", [A, cid]);
  await as(
    A,
    "insert into sos_events (user_id, client_id) values ($1, $2) on conflict (client_id) do nothing",
    [A, cid],
  );
  const rows = await db.query("select 1 from sos_events where client_id = $1", [cid]);
  assert.equal(rows.rows.length, 1);
});

test("delivery logs are readable by the event owner only", async () => {
  await db.query(
    `insert into notifications (event_id, kind, channel, recipient, status)
     values ($1, 'opened', 'sms', '+91******0002', 'sent')`,
    [eventId],
  );
  assert.equal((await as(A, "select 1 from notifications")).rows.length, 1);
  assert.equal((await as(B, "select 1 from notifications")).rows.length, 0);
  await assert.rejects(
    as(
      A,
      `insert into notifications (event_id, kind, channel, recipient, status)
       values ($1, 'opened', 'sms', 'x', 'sent')`,
      [eventId],
    ),
    /row-level security/,
  );
});

test("check-ins are private to their owner", async () => {
  await as(C, "insert into check_ins (user_id, deadline) values ($1, now() + interval '1 hour')", [C]);
  assert.equal((await as(C, "select 1 from check_ins")).rows.length, 1);
  assert.equal((await as(A, "select 1 from check_ins where user_id = $1", [C])).rows.length, 0);
  await assert.rejects(
    as(C, "insert into check_ins (user_id, deadline) values ($1, now())", [A]),
    /row-level security/,
  );
  await as(C, "delete from check_ins");
});

test("a missed check-in opens one SOS event; future and live ones wait", async () => {
  await db.query(
    `insert into check_ins (user_id, deadline) values
       ($1, now() - interval '1 minute'),
       ($2, now() + interval '1 hour'),
       ($3, now() - interval '1 minute')`,
    [C, B, A],
  );
  const live = await db.query(
    "select 1 from sos_events where user_id = $1 and state in ('broadcasting', 'acknowledged', 'enroute')",
    [A],
  );
  assert.ok(live.rows.length > 0, "A already has a live SOS from setup");

  const fired = await db.query("select fire_missed_check_ins() as n");
  assert.equal(fired.rows[0].n, 1);

  const opened = await db.query("select user_id from sos_events where from_check_in");
  assert.deepEqual(opened.rows.map((r) => r.user_id), [C]);
  const left = await db.query("select user_id from check_ins");
  assert.deepEqual(left.rows.map((r) => r.user_id), [B]);
});

test("signed-out callers cannot reach the security definer functions", async () => {
  const asAnon = (sql) =>
    db.transaction(async (tx) => {
      await tx.exec("set local role anon");
      return tx.query(sql);
    });
  for (const call of [
    "select invite_contact('+919800000000')",
    "select * from my_circle()",
    "select issue_relay_secret()",
    `select * from event_responders('${eventId}')`,
    "select request_fanout()",
  ]) {
    await assert.rejects(asAnon(call), /permission denied/, call);
  }
  // Signed in, the same functions answer; RLS still calls is_connected_to.
  const circle = await as(A, "select * from my_circle()");
  assert.ok(Array.isArray(circle.rows));
  const visible = await asAnon("select count(*)::int as n from sos_events");
  assert.equal(visible.rows[0].n, 0);
});
