"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Icons } from "@/components/icons";
import { useLang } from "@/components/lang";
import { CountUp, Reveal, useInView } from "@/components/motion";
import { Section, SectionHead, cn } from "@/components/site";
import type { Key } from "@/lib/i18n";

export const REPO_URL = "https://github.com/kandulanikhilvarma/to-du";

type Icon = (p: { className?: string }) => React.ReactElement;

/* ---------------------------------------------------------- architecture -- */

const TABS = [
  { id: "system", label: "arch.tab.system" },
  { id: "life", label: "arch.tab.life" },
  { id: "access", label: "arch.tab.access" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function Architecture() {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>("system");

  function onKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = TABS.findIndex((x) => x.id === tab);
    const step = e.key === "ArrowRight" ? 1 : TABS.length - 1;
    const next = TABS[(i + step) % TABS.length].id;
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  return (
    <Section id="architecture" className="border-y border-line bg-surface/30">
      <SectionHead
        eyebrow={t("arch.eyebrow")}
        title={t("arch.title")}
        sub={t("arch.sub")}
      />

      <div
        role="tablist"
        aria-label={t("arch.eyebrow")}
        onKeyDown={onKey}
        className="mt-10 inline-flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1"
      >
        {TABS.map((x) => (
          <button
            key={x.id}
            id={`tab-${x.id}`}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            aria-controls={`panel-${x.id}`}
            tabIndex={tab === x.id ? 0 : -1}
            onClick={() => setTab(x.id)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              tab === x.id ? "bg-brand text-bg" : "text-ink-muted hover:text-ink",
            )}
          >
            {t(x.label)}
          </button>
        ))}
      </div>

      <div
        key={tab}
        id={`panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className="todu-rung mt-8"
      >
        {tab === "system" && <SystemView />}
        {tab === "life" && <LifecycleView />}
        {tab === "access" && <AccessView />}
      </div>
    </Section>
  );
}

/** Three dashes sliding downward, turned sideways on wide screens. */
function Flow() {
  return (
    <div aria-hidden="true" className="flex justify-center">
      <svg viewBox="0 0 48 48" className="size-12 text-brand lg:-rotate-90">
        {[16, 24, 32].map((x, i) => (
          <g key={x} fill="none" strokeLinecap="round">
            <path d={`M${x} 2V38`} className="stroke-line" strokeWidth="1.5" />
            <path
              d={`M${x} 2V38`}
              pathLength={100}
              stroke="currentColor"
              strokeWidth="2.5"
              className="todu-flow"
              style={{ "--d": `${i * 400}ms` } as React.CSSProperties}
            />
          </g>
        ))}
        <path
          d="m17 39 7 7 7-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function Node({
  icon: I,
  title,
  children,
  className,
}: {
  icon: Icon;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-line bg-surface p-5", className)}>
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-brand/30 bg-brand/10">
          <I className="size-4.5 text-brand" />
        </span>
        <h3 className="text-base font-semibold text-ink">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function SystemView() {
  const { t } = useLang();

  const phone: Key[] = ["arch.phone.i1", "arch.phone.i2", "arch.phone.i3", "arch.phone.i4"];
  const cloud = [
    { icon: Icons.beacon, t: "arch.rt.t", d: "arch.rt.d" },
    { icon: Icons.database, t: "arch.db.t", d: "arch.db.d" },
    { icon: Icons.bolt, t: "arch.fn.t", d: "arch.fn.d" },
    { icon: Icons.timer, t: "arch.cron.t", d: "arch.cron.d" },
  ] as const;

  return (
    <div>
      <div className="grid items-center gap-2 lg:grid-cols-[1fr_auto_1.3fr_auto_1fr]">
        <Node icon={Icons.phone} title={t("arch.phone.t")}>
          <ul className="mt-4 flex flex-col gap-2.5">
            {phone.map((k) => (
              <li key={k} className="flex gap-2.5 text-sm text-ink-muted">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                {t(k)}
              </li>
            ))}
          </ul>
        </Node>

        <Flow />

        <Node
          icon={Icons.cloud}
          title={t("arch.cloud.t")}
          className="border-brand/40 shadow-[0_0_80px_-30px] shadow-brand/50"
        >
          <ul className="mt-4 grid gap-2">
            {cloud.map((c) => (
              <li
                key={c.t}
                className="flex gap-3 rounded-xl border border-line bg-bg/60 p-3"
              >
                <c.icon className="mt-0.5 size-4 shrink-0 text-brand" />
                <div>
                  <p className="text-sm font-medium text-ink">{t(c.t)}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-faint">
                    {t(c.d)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Node>

        <Flow />

        <div className="grid gap-3">
          <Node icon={Icons.monitor} title={t("arch.console.t")}>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              {t("arch.console.d")}
            </p>
          </Node>
          <Node icon={Icons.people} title={t("arch.circle.t")}>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              {t("arch.circle.d")}
            </p>
          </Node>
        </div>
      </div>

      <p className="mt-6 flex items-start gap-3 rounded-xl border border-line bg-surface p-4 text-sm leading-relaxed text-ink-muted">
        <Icons.wifi className="mt-0.5 size-4 shrink-0 text-brand" />
        {t("arch.sys.note")}
      </p>
    </div>
  );
}

const LIFE = [
  { k: "armed", tone: "idle" },
  { k: "countdown", tone: "warn" },
  { k: "broadcast", tone: "sos" },
  { k: "ack", tone: "brand" },
  { k: "enroute", tone: "brand" },
  { k: "resolved", tone: "ok" },
] as const;
type LifeState = (typeof LIFE)[number]["k"] | "false";

// Red appears only on Broadcasting, the one state that is a live SOS.
const TONE = {
  idle: "border-ink-faint/50 bg-surface-2 text-ink",
  warn: "border-warn/60 bg-warn/10 text-warn",
  sos: "border-sos/60 bg-sos/10 text-sos",
  brand: "border-brand/60 bg-brand/10 text-brand",
  ok: "border-ok/60 bg-ok/10 text-ok",
} as const;

function LifecycleView() {
  const { t } = useLang();
  const [ref, seen] = useInView<HTMLDivElement>();
  const [active, setActive] = useState<LifeState>("armed");
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!seen || !playing || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const id = setInterval(() => {
      setActive((a) => LIFE[(LIFE.findIndex((s) => s.k === a) + 1) % LIFE.length].k);
    }, 2800);
    return () => clearInterval(id);
  }, [seen, playing]);

  function pick(s: LifeState) {
    setPlaying(false);
    setActive(s);
  }

  const idx = LIFE.findIndex((s) => s.k === active);
  const tone = idx < 0 ? "idle" : LIFE[idx].tone;

  return (
    <div ref={ref}>
      <div className="relative">
        <div aria-hidden="true" className="absolute inset-x-0 top-1/2 hidden h-px bg-line lg:block" />
        <div
          aria-hidden="true"
          className="absolute left-0 top-1/2 hidden h-0.5 -translate-y-px bg-brand transition-[width] duration-700 lg:block"
          style={{ width: `${(Math.max(0, idx) / (LIFE.length - 1)) * 100}%` }}
        />
        <ol className="relative grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {LIFE.map((s, i) => {
            const on = active === s.k;
            return (
              // Opaque backing so the progress line never shows through a tint.
              <li key={s.k} className="rounded-xl bg-surface">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => pick(s.k)}
                  className={cn(
                    "w-full rounded-xl border px-3 py-3 text-left transition-all duration-300",
                    on
                      ? cn(TONE[s.tone], "scale-[1.03] shadow-lg shadow-black/20")
                      : "border-line bg-surface text-ink-muted hover:border-brand/40",
                  )}
                >
                  <span className="block text-[0.65rem] tabular-nums text-ink-faint">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="mt-0.5 block text-sm font-semibold">
                    {t(`life.${s.k}` as Key)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Branch
          on={active === "false"}
          onClick={() => pick("false")}
          via={t("life.cancelPin")}
          to={t("life.false")}
        />
        <Branch
          on={false}
          onClick={() => pick("broadcast")}
          via={t("life.duressPin")}
          to={t("life.broadcast")}
        />
      </div>

      <div
        aria-live={playing ? "off" : "polite"}
        className="mt-6 grid gap-4 rounded-2xl border border-line bg-surface p-6 sm:grid-cols-[auto_1fr_auto] sm:items-center"
      >
        <span
          className={cn(
            "inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider",
            TONE[tone],
          )}
        >
          {tone === "sos" && <span className="todu-pulse size-1.5 rounded-full bg-sos" />}
          {t(`life.${active}` as Key)}
        </span>
        <p key={active} className="todu-rung text-sm leading-relaxed text-ink-muted">
          {t(`life.${active}.d` as Key)}
        </p>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="w-fit rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink hover:border-brand/60"
        >
          {playing ? t("life.pause") : t("life.play")}
        </button>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ink-faint">{t("life.hint")}</p>
    </div>
  );
}

function Branch({
  on,
  onClick,
  via,
  to,
}: {
  on: boolean;
  onClick: () => void;
  via: string;
  to: string;
}) {
  const { t } = useLang();
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-dashed px-4 py-3 text-left text-sm transition-colors",
        on ? TONE.idle : "border-line text-ink-muted hover:border-brand/40",
      )}
    >
      <span className="font-medium text-ink">{t("life.countdown")}</span>
      <Icons.arrow className="size-3.5 text-ink-faint" />
      <span className="text-xs uppercase tracking-wider text-ink-faint">{via}</span>
      <Icons.arrow className="size-3.5 text-ink-faint" />
      <span className="font-medium text-ink">{to}</span>
    </button>
  );
}

const ACCESS_ROWS: Key[] = ["access.r1", "access.r2", "access.r3"];
const ACCESS_COLS = [
  { k: "access.owner", ok: true },
  { k: "access.circle", ok: true },
  { k: "access.pending", ok: false },
  { k: "access.stranger", ok: false },
] as const;

function AccessView() {
  const { t } = useLang();
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ACCESS_COLS.map((c, i) => (
          <Reveal key={c.k} delay={i * 90}>
            <div
              className={cn(
                "h-full rounded-2xl border bg-surface p-5",
                c.ok ? "border-ok/30" : "border-line",
              )}
            >
              <h3 className="text-base font-semibold text-ink">{t(c.k)}</h3>
              <ul className="mt-4 flex flex-col gap-3">
                {ACCESS_ROWS.map((r) => (
                  <li key={r} className="flex items-start gap-2.5 text-sm">
                    {c.ok ? (
                      <Icons.check className="mt-0.5 size-4 shrink-0 text-ok" />
                    ) : (
                      <Icons.cross className="mt-0.5 size-4 shrink-0 text-ink-faint" />
                    )}
                    <span className="text-ink-muted">
                      {t(r)}
                      <span className="block text-xs font-semibold uppercase tracking-wider text-ink-faint">
                        {c.ok ? t("access.yes") : t("access.no")}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        ))}
      </div>
      <p className="mt-6 flex items-start gap-3 rounded-xl border border-line bg-surface p-4 text-sm leading-relaxed text-ink-muted">
        <Icons.lock className="mt-0.5 size-4 shrink-0 text-brand" />
        {t("access.note")}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- built -- */

const STATS = [
  { n: 46, k: "built.s.tests" },
  { n: 26, k: "built.s.rls" },
  { n: 16, k: "built.s.fn" },
  { n: 9, k: "built.s.mig" },
] as const;

type Status = "tested" | "built" | "field" | "live";

const FEATURES: ReadonlyArray<{ k: Key; s: Status }> = [
  { k: "built.f.pins", s: "tested" },
  { k: "built.f.queue", s: "tested" },
  { k: "built.f.timeline", s: "tested" },
  { k: "built.f.checkin", s: "built" },
  { k: "built.f.shake", s: "built" },
  { k: "built.f.fake", s: "built" },
  { k: "built.f.tile", s: "built" },
  { k: "built.f.photo", s: "built" },
  { k: "built.f.relay", s: "field" },
  { k: "built.f.console", s: "live" },
  { k: "built.f.langs", s: "live" },
];

const STATUS: Record<Status, { k: Key; cls: string }> = {
  tested: { k: "built.st.tested", cls: "border-ok/40 text-ok" },
  built: { k: "built.st.built", cls: "border-brand/40 text-brand" },
  field: { k: "built.st.field", cls: "border-warn/40 text-warn" },
  live: { k: "built.st.live", cls: "border-indigo/40 text-indigo" },
};

const STACK = [
  "Expo SDK 57",
  "React Native 0.86",
  "TypeScript strict",
  "Next.js 16",
  "React 19",
  "Tailwind v4",
  "Supabase",
  "Postgres + PostGIS",
  "Deno Edge Functions",
  "pg_cron",
  "Vercel",
  "GitHub Actions",
];

function StatusTag({ s }: { s: Status }) {
  const { t } = useLang();
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider",
        STATUS[s].cls,
      )}
    >
      {t(STATUS[s].k)}
    </span>
  );
}

/** A street grid with the live trail drawing itself toward a beacon. */
function TrailTile() {
  const { t } = useLang();
  const trail = "M24 160 C56 160 64 124 96 120 S140 92 164 96 S214 62 240 58 S282 34 292 30";

  return (
    <div className="relative flex h-full min-h-72 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      <svg
        viewBox="0 0 320 190"
        aria-hidden="true"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
      >
        <g className="stroke-line" strokeWidth="1">
          {[40, 80, 120, 160, 200, 240, 280].map((x) => (
            <path key={`x${x}`} d={`M${x} 0V190`} />
          ))}
          {[38, 76, 114, 152].map((y) => (
            <path key={`y${y}`} d={`M0 ${y}H320`} />
          ))}
        </g>
        <g className="fill-surface-2">
          <rect x="48" y="46" width="64" height="22" rx="3" />
          <rect x="178" y="118" width="54" height="26" rx="3" />
          <rect x="248" y="84" width="40" height="22" rx="3" />
        </g>
        <path d={trail} fill="none" className="stroke-line" strokeWidth="4" strokeLinecap="round" />
        <path
          d={trail}
          pathLength={100}
          fill="none"
          className="todu-draw stroke-brand"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <circle cx="24" cy="160" r="4" className="fill-ink-faint" />
        {[0, 1200, 2400].map((d) => (
          <circle
            key={d}
            cx="292"
            cy="30"
            r="26"
            className="todu-radar fill-none stroke-brand"
            strokeWidth="1.5"
            style={{ "--d": `${d}ms` } as React.CSSProperties}
          />
        ))}
        <circle cx="292" cy="30" r="5" className="fill-brand" />
      </svg>

      <div className="relative mt-auto bg-linear-to-t from-surface via-surface/90 to-transparent p-6 pt-16">
        <StatusTag s="built" />
        <h3 className="mt-3 text-lg font-semibold text-ink">{t("built.f.trail")}</h3>
        <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-muted">
          {t("built.trail.d")}
        </p>
      </div>
    </div>
  );
}

export function Built({ id = "built" }: { id?: string }) {
  const { t } = useLang();

  return (
    <Section id={id}>
      <SectionHead
        eyebrow={t("built.eyebrow")}
        title={t("built.title")}
        sub={t("built.sub")}
      />

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Reveal className="sm:col-span-2 lg:row-span-2">
          <TrailTile />
        </Reveal>

        {STATS.map((s, i) => (
          <Reveal key={s.k} delay={90 * (i + 1)}>
            <div className="h-full rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-brand/40">
              <CountUp to={s.n} className="text-4xl font-semibold text-brand" />
              <p className="mt-2 text-sm leading-snug text-ink-muted">{t(s.k)}</p>
            </div>
          </Reveal>
        ))}

        <Reveal className="sm:col-span-2 lg:col-span-4">
          <div className="rounded-2xl border border-line bg-surface p-6">
            <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <li
                  key={f.k}
                  className="flex items-center justify-between gap-3 border-b border-line/60 pb-3"
                >
                  <span className="text-sm text-ink">{t(f.k)}</span>
                  <StatusTag s={f.s} />
                </li>
              ))}
            </ul>
            <p className="mt-5 text-xs leading-relaxed text-ink-faint">{t("built.note")}</p>
          </div>
        </Reveal>

        <Reveal className="sm:col-span-2 lg:col-span-3">
          <div className="h-full rounded-2xl border border-line bg-surface p-6">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-faint">
              {t("built.stack")}
            </h3>
            <ul className="mt-4 flex flex-wrap gap-2">
              {STACK.map((s) => (
                <li
                  key={s}
                  className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 font-mono text-xs text-ink-muted"
                >
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal className="sm:col-span-2 lg:col-span-1">
          <a
            href={REPO_URL}
            className="group flex h-full flex-col justify-between gap-6 rounded-2xl border border-brand/40 bg-brand/5 p-6 transition-colors hover:bg-brand/10"
          >
            <Icons.code className="size-6 text-brand" />
            <span className="flex items-center justify-between gap-3 text-base font-semibold text-ink">
              {t("built.repo")}
              <Icons.arrow className="size-4 text-brand transition-transform group-hover:translate-x-1" />
            </span>
          </a>
        </Reveal>
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------------- maker -- */

export function Monogram({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 96 96"
      role="img"
      aria-label="Nikhilvarma Kandula"
      className={cn("size-20 shrink-0", className)}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-brand)" />
          <stop offset="1" stopColor="var(--color-indigo)" />
        </linearGradient>
      </defs>
      <circle
        cx="48"
        cy="48"
        r="46"
        className="todu-radar fill-none stroke-brand"
        strokeWidth="2"
      />
      <circle cx="48" cy="48" r="40" fill={`url(#${id})`} />
      <text
        x="48"
        y="57"
        textAnchor="middle"
        fontSize="26"
        fontWeight="600"
        className="fill-bg"
      >
        NK
      </text>
    </svg>
  );
}

export function MakerTeaser() {
  const { t } = useLang();

  return (
    <Section id="maker">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border border-line bg-surface p-8 sm:p-10">
          <div
            aria-hidden="true"
            className="todu-drift pointer-events-none absolute -right-24 -top-28 size-80 rounded-full bg-indigo/15 blur-3xl"
          />
          <div className="relative grid items-center gap-8 md:grid-cols-[auto_1fr_auto]">
            <Monogram />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
                {t("maker.eyebrow")}
              </p>
              <h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                {t("maker.title")}
              </h2>
              <p className="mt-3 max-w-2xl text-pretty text-base leading-relaxed text-ink-muted">
                {t("maker.body")}
              </p>
            </div>
            <Link
              href="/about"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-bg transition-colors hover:bg-brand/90"
            >
              {t("maker.cta")}
              <Icons.arrow className="size-4" />
            </Link>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
