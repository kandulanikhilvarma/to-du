"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LanguageSwitcher, useLang } from "@/components/lang";
import { ThemeSwitcher } from "@/components/theme";
import { Logo, cn } from "@/components/site";
import {
  acknowledge,
  answerInvite,
  currentUser,
  hasSupabaseConfig,
  loadEventDetail,
  loadEvents,
  loadInvites,
  normalizePhone,
  onAuthChange,
  sendOtp,
  signOut,
  subscribeToEvent,
  verifyOtp,
  type EventSource,
  type Invite,
  type ResponderStatus,
  type SosEvent,
  type SosState,
  type TimelineEntry,
  type Transport,
} from "@/lib/data";
import type { Key } from "@/lib/i18n";

type Translate = ReturnType<typeof useLang>["t"];
type MyStatus = "enroute" | "arrived";
type Auth = "unknown" | "signed_out" | { phone: string };

const REFRESH_MS = 20_000;
const ETAS = [5, 10, 15, 30];

const STATE_KEY: Record<SosState, Key> = {
  broadcasting: "dash.active",
  acknowledged: "dash.acknowledged",
  enroute: "dash.enroute",
  resolved: "dash.resolved",
};

/** Colour plus a word, never colour alone. */
const STATE_STYLE: Record<SosState, string> = {
  broadcasting: "border-sos/50 bg-sos/10 text-sos",
  acknowledged: "border-warn/50 bg-warn/10 text-warn",
  enroute: "border-indigo/50 bg-indigo/10 text-indigo",
  resolved: "border-ok/50 bg-ok/10 text-ok",
};

const STATUS_KEY: Record<ResponderStatus, Key> = {
  notified: "status.notified",
  acknowledged: "status.acknowledged",
  enroute: "status.enroute",
  arrived: "status.arrived",
};

const TRANSPORT_KEY: Record<Transport, Key> = {
  realtime: "transport.realtime",
  sms: "transport.sms",
  ble: "transport.ble",
  voice: "transport.voice",
  dial112: "transport.dial112",
};

function ago(t: Translate, minutes: number): string {
  if (minutes <= 0) return t("time.now");
  if (minutes < 60) return t("time.min", { n: minutes });
  return t("time.hr", { n: Math.floor(minutes / 60) });
}

function entryText(t: Translate, entry: TimelineEntry): string {
  if (entry.label) return entry.label;
  if (entry.ping) return t("dash.pingLabel", { n: entry.ping.accuracy });
  if (entry.ack) return `${entry.ack.name}: ${t(STATUS_KEY[entry.ack.status])}`;
  return "";
}

export function ResponderConsole() {
  const { t } = useLang();
  const live = hasSupabaseConfig();

  const [auth, setAuth] = useState<Auth>(live ? "unknown" : { phone: "" });
  const [events, setEvents] = useState<SosEvent[]>([]);
  const [source, setSource] = useState<EventSource>(live ? "live" : "demo");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myStatus, setMyStatus] = useState<Record<string, MyStatus>>({});
  const [notice, setNotice] = useState<Key | null>(null);

  const signedIn = typeof auth === "object";

  useEffect(() => {
    if (!live) return;
    const check = () => {
      void currentUser().then((user) => setAuth(user ? { phone: user.phone } : "signed_out"));
    };
    check();
    return onAuthChange(check);
  }, [live]);

  const refresh = useCallback(
    () =>
      loadEvents()
        .then((data) => {
          // Keep any detail already loaded for an event; the list query omits it.
          setEvents((prev) =>
            data.events.map((next) => {
              const old = prev.find((e) => e.id === next.id);
              return old && data.source === "live"
                ? { ...next, responders: old.responders, timeline: old.timeline }
                : next;
            }),
          );
          setSource(data.source);
          setSelectedId((id) => id ?? data.events[0]?.id ?? null);
          setError(null);
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    if (!signedIn) return;
    void refresh();
    if (!live) return;
    const id = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(id);
  }, [signedIn, live, refresh]);

  // Selected live event: who is coming, the trail, and pushed pings.
  useEffect(() => {
    if (!live || !signedIn || !selectedId) return;
    let cancelled = false;

    const loadDetail = () => {
      loadEventDetail(selectedId)
        .then((detail) => {
          if (cancelled) return;
          setEvents((prev) => prev.map((e) => (e.id === selectedId ? { ...e, ...detail } : e)));
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(e instanceof Error ? e.message : String(e));
        });
    };
    loadDetail();

    const unsubscribe = subscribeToEvent(selectedId, (ping) => {
      const accuracy = Math.round(ping.accuracy ?? 0);
      setEvents((prev) =>
        prev.map((e) =>
          e.id === selectedId
            ? {
                ...e,
                lat: ping.lat,
                lng: ping.lng,
                accuracyMetres: accuracy,
                lastPingMinutesAgo: 0,
                timeline: [...e.timeline, { minutesAgo: 0, ping: { accuracy }, transport: "realtime" }],
              }
            : e,
        ),
      );
      setNotice("dash.liveUpdate");
    });
    const id = setInterval(loadDetail, REFRESH_MS);

    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(id);
    };
  }, [live, signedIn, selectedId]);

  const selected = useMemo(
    () => events.find((e) => e.id === selectedId) ?? null,
    [events, selectedId],
  );

  async function respond(event: SosEvent, status: MyStatus, eta: number | null) {
    setMyStatus((m) => ({ ...m, [event.id]: status }));

    if (!live) {
      // Demo: reflect the response locally so the flow can be tried.
      const you = t("dash.you");
      setEvents((prev) =>
        prev.map((e) =>
          e.id === event.id
            ? {
                ...e,
                state: e.state === "resolved" ? e.state : "enroute",
                responders: [
                  ...e.responders.filter((r) => r.name !== you),
                  { name: you, status, etaMinutes: eta ?? undefined },
                ],
                timeline: [...e.timeline, { minutesAgo: 0, ack: { name: you, status } }],
              }
            : e,
        ),
      );
      return;
    }

    const failure = await acknowledge(event.id, status, eta);
    if (failure) {
      setError(failure);
      setMyStatus((m) => {
        const next = { ...m };
        delete next[event.id];
        return next;
      });
      return;
    }
    const detail = await loadEventDetail(event.id).catch(() => null);
    if (detail) {
      setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, ...detail } : e)));
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" aria-label={t("a11y.home")}>
            <Logo />
          </Link>
          <span
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wider",
              source === "live"
                ? "border-ok/50 bg-ok/10 text-ok"
                : "border-warn/50 bg-warn/10 text-warn",
            )}
          >
            {source === "live" ? t("dash.live") : t("dash.demo")}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {live && signedIn && typeof auth === "object" && (
              <>
                <span className="hidden text-xs text-ink-faint md:inline">
                  {t("dash.signedInAs", { phone: `+${auth.phone.replace(/^\+/, "")}` })}
                </span>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink hover:border-brand/60"
                >
                  {t("dash.signOut")}
                </button>
              </>
            )}
            <LanguageSwitcher className="hidden sm:inline-flex" />
            <ThemeSwitcher className="hidden sm:inline-flex" />
            <Link
              href="/"
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink hover:border-brand/60"
            >
              {t("dash.back")}
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("dash.title")}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t("dash.sub")}</p>

        {source === "demo" && (
          <p className="mt-4 rounded-xl border border-warn/30 bg-warn/5 p-4 text-sm leading-relaxed text-ink-muted">
            {t("dash.demoBody")}
          </p>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-warn">
            {error}
          </p>
        )}

        <p aria-live="polite" className="sr-only">
          {notice ? t(notice) : ""}
        </p>

        {live && signedIn && <InvitesPanel />}

        {auth === "unknown" ? (
          <p className="mt-10 text-sm text-ink-faint">{t("dash.loading")}</p>
        ) : auth === "signed_out" ? (
          <SignIn />
        ) : loading ? (
          <p className="mt-10 text-sm text-ink-faint">{t("dash.loading")}</p>
        ) : events.length === 0 ? (
          <p className="mt-10 rounded-xl border border-line bg-surface p-6 text-sm text-ink-muted">
            {t("dash.none")}
          </p>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-[22rem_1fr]">
            <ul className="flex flex-col gap-2">
              {events.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(e.id)}
                    aria-current={e.id === selectedId}
                    className={cn(
                      "w-full rounded-xl border p-4 text-left transition-colors",
                      e.id === selectedId
                        ? "border-brand/60 bg-surface-2"
                        : "border-line bg-surface hover:border-ink-faint/40",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-xs font-semibold text-ink-muted">
                        {e.personInitials}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {e.personName}
                        </span>
                        <span className="block truncate text-xs text-ink-faint">
                          {e.placeLabel || t("dash.noFix")}
                        </span>
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider",
                          STATE_STYLE[e.state],
                        )}
                      >
                        {t(STATE_KEY[e.state])}
                      </span>
                      <span className="text-xs text-ink-faint">{ago(t, e.openedMinutesAgo)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            {selected ? (
              <EventDetail
                event={selected}
                mine={myStatus[selected.id]}
                onRespond={(status, eta) => void respond(selected, status, eta)}
              />
            ) : (
              <p className="rounded-xl border border-line bg-surface p-6 text-sm text-ink-muted">
                {t("dash.select")}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/** Invitations to become someone responder, and who this responder covers.
 *  Accepting is what makes their SOS events visible here. */
function InvitesPanel() {
  const { t } = useLang();
  const [pending, setPending] = useState<Invite[]>([]);
  const [respondingFor, setRespondingFor] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      loadInvites()
        .then((data) => {
          setPending(data.pending);
          setRespondingFor(data.respondingFor);
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function answer(connectionId: string, accept: boolean) {
    const failure = await answerInvite(connectionId, accept);
    if (failure) setError(failure);
    await load();
  }

  return (
    <section className="mt-6 grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-faint">
          {t("dash.invites")}
        </h2>
        <ul className="mt-3 flex flex-col gap-3">
          {pending.map((inv) => (
            <li key={inv.connectionId} className="flex flex-wrap items-center gap-3">
              <span className="flex-1 text-sm text-ink">
                {t("dash.inviteBody", { name: inv.ownerName })}
              </span>
              <button
                type="button"
                onClick={() => void answer(inv.connectionId, true)}
                className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-bg hover:bg-brand/90"
              >
                {t("dash.accept")}
              </button>
              <button
                type="button"
                onClick={() => void answer(inv.connectionId, false)}
                className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink hover:border-ink-faint"
              >
                {t("dash.decline")}
              </button>
            </li>
          ))}
          {pending.length === 0 && <li className="text-sm text-ink-faint">{t("dash.noneYet")}</li>}
        </ul>
        {error && (
          <p role="alert" className="mt-3 text-sm text-warn">
            {error}
          </p>
        )}
      </div>
      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-faint">
          {t("dash.respondingFor")}
        </h2>
        {respondingFor.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1 text-sm text-ink">
            {respondingFor.map((who) => (
              <li key={who}>{who}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-faint">{t("dash.respondingNone")}</p>
        )}
      </div>
    </section>
  );
}

function SignIn() {
  const { t } = useLang();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setError(t("cta.err"));
      return;
    }
    setBusy(true);
    const failure = codeSent
      ? await verifyOtp(normalized, code.trim())
      : await sendOtp(normalized);
    setBusy(false);
    if (failure) setError(t("dash.authError", { msg: failure }));
    else if (!codeSent) setCodeSent(true);
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto mt-10 flex max-w-md flex-col gap-3 rounded-2xl border border-line bg-surface p-6"
    >
      <h2 className="text-lg font-semibold text-ink">{t("dash.signInTitle")}</h2>
      <p className="text-sm leading-relaxed text-ink-muted">{t("dash.signInBody")}</p>
      <label className="text-sm text-ink-faint">
        {t("dash.phone")}
        <input
          name="phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-1 w-full rounded-xl border border-line bg-bg px-4 py-3 text-base text-ink focus:border-brand focus:outline-none"
        />
      </label>
      {codeSent && (
        <label className="text-sm text-ink-faint">
          {t("dash.code")}
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1 w-full rounded-xl border border-line bg-bg px-4 py-3 text-base tracking-widest text-ink focus:border-brand focus:outline-none"
          />
        </label>
      )}
      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-brand px-5 py-3 text-base font-semibold text-bg hover:bg-brand/90 disabled:opacity-60"
      >
        {codeSent ? t("dash.verify") : t("dash.sendCode")}
      </button>
      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}
    </form>
  );
}

function EventDetail({
  event,
  mine,
  onRespond,
}: {
  event: SosEvent;
  mine: MyStatus | undefined;
  onRespond: (status: MyStatus, eta: number | null) => void;
}) {
  const { t } = useLang();
  const [eta, setEta] = useState(10);
  const closed = event.state === "resolved";

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">{event.personName}</h2>
            <p className="mt-1 text-sm text-ink-muted">{event.placeLabel || t("dash.noFix")}</p>
            {event.lat !== null && event.lng !== null && (
              <p className="mt-1 font-mono text-xs text-ink-faint">
                {event.lat.toFixed(4)}, {event.lng.toFixed(4)}
              </p>
            )}
          </div>
          <span
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wider",
              STATE_STYLE[event.state],
            )}
          >
            {t(STATE_KEY[event.state])}
          </span>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
          <Stat
            label={t("dash.battery")}
            value={event.batteryPercent === null ? t("dash.unknown") : `${event.batteryPercent}%`}
            alert={event.batteryPercent !== null && event.batteryPercent < 15}
          />
          <Stat
            label={t("dash.accuracy")}
            value={event.accuracyMetres === null ? t("dash.unknown") : `${event.accuracyMetres} m`}
          />
          <Stat
            label={t("dash.lastPing")}
            value={
              event.lastPingMinutesAgo === null ? t("dash.noFix") : ago(t, event.lastPingMinutesAgo)
            }
          />
          <Stat label={t("dash.transport")} value={t(TRANSPORT_KEY[event.transport])} />
        </dl>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <a
            href="tel:112"
            className="rounded-lg bg-sos px-4 py-2.5 text-sm font-semibold text-white hover:bg-sos/90"
          >
            {t("dash.call")}
          </a>

          <div className="flex items-center overflow-hidden rounded-lg border border-line bg-surface-2">
            <label className="flex items-center gap-1.5 pl-3 text-xs text-ink-faint">
              {t("dash.etaLabel")}
              <select
                name="eta"
                value={eta}
                onChange={(e) => setEta(Number(e.target.value))}
                disabled={closed || mine !== undefined}
                className="cursor-pointer bg-transparent py-2.5 text-sm text-ink disabled:opacity-50"
              >
                {ETAS.map((n) => (
                  <option key={n} value={n}>
                    {t("dash.minutes", { n })}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => onRespond("enroute", eta)}
              disabled={closed || mine !== undefined}
              className="border-l border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface disabled:opacity-50"
            >
              {mine ? t("dash.acked") : t("dash.ack")}
            </button>
          </div>

          <button
            type="button"
            onClick={() => onRespond("arrived", null)}
            disabled={closed || mine === "arrived"}
            className="rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-medium text-ink hover:border-ok/60 disabled:opacity-50"
          >
            {mine === "arrived" ? t("dash.arrivedDone") : t("dash.arrived")}
          </button>

          {event.lat !== null && event.lng !== null && (
            <a
              href={`https://www.openstreetmap.org/?mlat=${event.lat}&mlon=${event.lng}#map=17/${event.lat}/${event.lng}`}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-medium text-ink hover:border-brand/60"
            >
              {t("dash.openMap")}
            </a>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-faint">
            {t("dash.medical")}
          </h3>
          <dl className="mt-4 flex flex-col gap-3 text-sm">
            <Row label={t("dash.blood")} value={event.medical.bloodGroup || t("dash.noValue")} />
            <Row
              label={t("dash.allergies")}
              value={event.medical.allergies || t("dash.noValue")}
            />
            <Row label={t("dash.meds")} value={event.medical.medications || t("dash.noValue")} />
          </dl>

          <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-ink-faint">
            {t("dash.responders")}
          </h3>
          <ul className="mt-3 flex flex-col gap-2">
            {event.responders.map((r) => (
              <li
                key={r.name}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink">{r.name}</span>
                  {r.relationship && (
                    <span className="block text-xs text-ink-faint">{r.relationship}</span>
                  )}
                </span>
                <span className="shrink-0 text-right text-xs text-ink-muted">
                  {t(STATUS_KEY[r.status])}
                  {r.status === "enroute" && r.etaMinutes !== undefined && (
                    <span className="block text-ink-faint">{t("dash.eta", { n: r.etaMinutes })}</span>
                  )}
                </span>
              </li>
            ))}
            {event.responders.length === 0 && (
              <li className="text-sm text-ink-faint">{t("dash.noneYet")}</li>
            )}
          </ul>
        </div>

        <div className="rounded-xl border border-line bg-surface p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-faint">
            {t("dash.timeline")}
          </h3>
          <ol className="mt-4 flex flex-col gap-3">
            {event.timeline.map((entry, i) => (
              <li key={`${entry.minutesAgo}-${i}`} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                <span className="min-w-0">
                  <span className="block text-sm text-ink">{entryText(t, entry)}</span>
                  <span className="block text-xs text-ink-faint">
                    {ago(t, entry.minutesAgo)}
                    {entry.transport ? ` - ${t(TRANSPORT_KEY[entry.transport])}` : ""}
                  </span>
                </span>
              </li>
            ))}
            {event.timeline.length === 0 && (
              <li className="text-sm text-ink-faint">{t("dash.noEntries")}</li>
            )}
          </ol>
          {event.photos && event.photos.length > 0 && (
            <>
              <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-ink-faint">
                {t("dash.photos")}
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {event.photos.map((url, i) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    {/* Signed, expiring Supabase links: next/image would cache them past expiry. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={t("dash.photoAlt", { n: i + 1 })}
                      className="aspect-square w-full rounded-lg border border-line object-cover"
                    />
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="bg-surface px-3 py-3">
      <dt className="text-[0.7rem] uppercase tracking-wider text-ink-faint">{label}</dt>
      <dd className={cn("mt-1 text-sm font-medium", alert ? "text-warn" : "text-ink")}>{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}
