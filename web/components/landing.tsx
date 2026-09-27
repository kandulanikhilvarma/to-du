"use client";

import Link from "next/link";
import { useState } from "react";
import { Icons, iconBase } from "@/components/icons";
import { useLang } from "@/components/lang";
import { SosDrill } from "@/components/drill";
import { Reveal } from "@/components/motion";
import { Architecture, MakerTeaser } from "@/components/showcase";
import { Card, Section, SectionHead, cn } from "@/components/site";
import type { Key } from "@/lib/i18n";

/* ------------------------------------------------------------------ hero -- */

function Hero() {
  const { t } = useLang();

  return (
    <section className="relative overflow-hidden px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20">
      {/* Calm teal and indigo light. Red is never ambience, only live SOS. */}
      <div
        aria-hidden="true"
        className="todu-drift pointer-events-none absolute -left-40 -top-48 size-[34rem] rounded-full bg-brand/12 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="todu-drift pointer-events-none absolute -right-40 top-20 size-[26rem] rounded-full bg-indigo/10 blur-3xl [animation-delay:-9s]"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="todu-rung">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted">
            <span className="size-1.5 rounded-full bg-brand" />
            {t("hero.badge")}
          </p>

          <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-6xl">
            {t("hero.title")}
          </h1>

          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-ink-muted">
            {t("hero.sub")}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="#drill"
              className="shine group inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-base font-semibold text-bg shadow-[0_10px_30px_-12px] shadow-brand/60 transition-[background-color,translate] hover:-translate-y-0.5 hover:bg-brand/90"
            >
              {t("hero.ctaPrimary")}
              <svg {...iconBase} className="size-4 transition-transform group-hover:translate-x-1">
                <path d="M5 12h13M13 6.5 18.5 12 13 17.5" />
              </svg>
            </Link>
            <Link
              href="#limits"
              className="inline-flex items-center justify-center rounded-xl border border-line bg-surface px-6 py-3.5 text-base font-medium text-ink transition-[border-color,translate] hover:-translate-y-0.5 hover:border-brand/60"
            >
              {t("hero.ctaSecondary")}
            </Link>
          </div>

          <p className="mt-6 inline-flex items-center gap-2 text-sm text-ink-faint">
            <Icons.shield className="size-4 text-ok" />
            {t("hero.note")}
          </p>
        </div>

        <HeroDevice />
      </div>

      <HeroStats />
    </section>
  );
}

/** A compact device panel showing the ladder mid-escalation. */
function HeroDevice() {
  const { t } = useLang();

  // An offline escalation as the current build actually runs it: no data, the
  // SMS composer sent, 112 ready, Bluetooth relay not shipped yet, siren on.
  const rungs = [
    { icon: Icons.wifi, label: t("offline.l1.t"), tag: t("hero.device.noSignal"), tone: "dim" },
    { icon: Icons.message, label: t("offline.l2.t"), tag: t("hero.device.sent"), tone: "good" },
    { icon: Icons.phone, label: t("offline.l3.t"), tag: t("hero.device.ready"), tone: "plain" },
    { icon: Icons.bluetooth, label: t("offline.l4.t"), tag: t("hero.device.planned"), tone: "dim" },
    { icon: Icons.siren, label: t("offline.l5.t"), tag: t("hero.device.on"), tone: "good" },
  ] as const;

  const floats = [
    // Pinned to the frame edges so they never cover the ladder itself.
    { icon: Icons.people, k: "hero.float.circle", pos: "-top-5 -left-10", d: 0 },
    { icon: Icons.route, k: "hero.float.live", pos: "-bottom-5 -right-10", d: 1500 },
    { icon: Icons.phone, k: "hero.float.eta", pos: "-bottom-5 -left-10", d: 3000 },
  ] as const;

  return (
    <div className="relative mx-auto w-full max-w-sm">
      {/* Signal rings: the alert leaving the phone. */}
      <svg
        viewBox="0 0 400 400"
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 size-[150%] -translate-x-1/2 -translate-y-1/2"
      >
        {[0, 1200, 2400].map((d) => (
          <circle
            key={d}
            cx="200"
            cy="200"
            r="190"
            className="todu-radar fill-none stroke-brand"
            strokeWidth="1"
            style={{ "--d": `${d}ms` } as React.CSSProperties}
          />
        ))}
      </svg>

      {floats.map((f) => (
        <div
          key={f.k}
          aria-hidden="true"
          style={{ "--d": `${f.d}ms` } as React.CSSProperties}
          className={cn(
            "todu-float absolute z-10 hidden items-center gap-2 rounded-xl border border-line bg-surface/90 px-3 py-2 text-xs font-medium text-ink shadow-xl shadow-black/30 backdrop-blur xl:flex",
            f.pos,
          )}
        >
          <f.icon className="size-4 text-brand" />
          {t(f.k)}
        </div>
      ))}

      <div className="todu-float relative rounded-[2rem] border border-line bg-surface p-3 shadow-2xl shadow-black/40 [--d:-2s]">
        <div className="rounded-[1.5rem] border border-line bg-bg p-5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-xs font-medium text-sos">
              <span className="todu-pulse size-2 rounded-full bg-sos" />
              {t("hero.device.active")}
            </span>
            <span className="text-xs tabular-nums text-ink-faint">00:42</span>
          </div>

          <p className="mt-4 text-sm text-ink-muted">{t("hero.device.ladder")}</p>

          <ul className="mt-3 flex flex-col gap-2">
            {rungs.map((r, i) => (
              <li
                key={r.label}
                style={{ "--d": `${400 + i * 180}ms` } as React.CSSProperties}
                className={cn(
                  "todu-rung flex items-center gap-3 rounded-lg border px-3 py-2.5",
                  r.tone === "good"
                    ? "border-ok/40 bg-ok/5"
                    : r.tone === "dim"
                      ? "border-line bg-surface/60 opacity-60"
                      : "border-line bg-surface/60",
                )}
              >
                <r.icon
                  className={cn(
                    "size-4 shrink-0",
                    r.tone === "good" ? "text-ok" : "text-ink-faint",
                  )}
                />
                <span className="flex-1 truncate text-xs text-ink">
                  {r.label}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-[0.65rem] font-semibold uppercase tracking-wider",
                    r.tone === "good" ? "text-ok" : "text-ink-faint",
                  )}
                >
                  {r.tag}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-4 rounded-lg border border-line bg-surface/60 p-3 text-xs leading-relaxed text-ink-faint">
            {t("offline.queue")}
          </p>
        </div>
      </div>
    </div>
  );
}

function HeroStats() {
  const { t } = useLang();

  const stats: Array<{ value: string; label: Key }> = [
    { value: "5", label: "stat.ladder" },
    { value: "₹0", label: "stat.free" },
    { value: "112", label: "stat.dial" },
    { value: "3", label: "stat.langs" },
  ];

  return (
    <dl className="relative mx-auto mt-16 grid max-w-6xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:mt-20 lg:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="bg-surface px-5 py-6">
          <dt className="text-2xl font-semibold tabular-nums text-brand sm:text-3xl">
            {s.value}
          </dt>
          <dd className="mt-1 text-sm leading-snug text-ink-muted">
            {t(s.label)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------- how -- */

function HowItWorks() {
  const { t } = useLang();

  const steps = [
    { icon: Icons.tap, t: "how.s1.t", d: "how.s1.d" },
    { icon: Icons.timer, t: "how.s2.t", d: "how.s2.d" },
    { icon: Icons.people, t: "how.s3.t", d: "how.s3.d" },
    { icon: Icons.route, t: "how.s4.t", d: "how.s4.d" },
  ] as const;

  return (
    <Section id="how">
      <SectionHead
        eyebrow={t("how.eyebrow")}
        title={t("how.title")}
        sub={t("how.sub")}
      />
      <ol className="mt-12 grid gap-4 sm:grid-cols-2">
        {steps.map((s, i) => (
          <Card key={s.t} delay={i * 80}>
            <div className="flex items-start gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-brand/30 bg-brand/10">
                <s.icon className="size-5 text-brand" />
              </span>
              <div>
                <h3 className="flex items-baseline gap-2 text-base font-semibold text-ink">
                  <span className="text-xs tabular-nums text-ink-faint">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {t(s.t)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  {t(s.d)}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </ol>
    </Section>
  );
}

/* --------------------------------------------------------------- offline -- */

function OfflineLadder() {
  const { t } = useLang();

  const rungs = [
    {
      icon: Icons.wifi,
      t: "offline.l1.t",
      d: "offline.l1.d",
      tag: "offline.l1.tag",
      tone: "ok",
    },
    {
      icon: Icons.message,
      t: "offline.l2.t",
      d: "offline.l2.d",
      tag: "offline.l2.tag",
      tone: "brand",
    },
    {
      icon: Icons.phone,
      t: "offline.l3.t",
      d: "offline.l3.d",
      tag: "offline.l3.tag",
      tone: "ok",
    },
    {
      icon: Icons.bluetooth,
      t: "offline.l4.t",
      d: "offline.l4.d",
      tag: "offline.l4.tag",
      tone: "warn",
    },
    {
      icon: Icons.siren,
      t: "offline.l5.t",
      d: "offline.l5.d",
      tag: "offline.l5.tag",
      tone: "warn",
    },
  ] as const;

  const toneClass = {
    ok: "border-ok/40 text-ok",
    brand: "border-brand/40 text-brand",
    warn: "border-warn/40 text-warn",
  } as const;

  return (
    <Section id="offline" className="border-y border-line bg-surface/30">
      <SectionHead
        eyebrow={t("offline.eyebrow")}
        title={t("offline.title")}
        sub={t("offline.sub")}
      />

      <Reveal>
        <ol className="mt-12 flex flex-col gap-3">
          {rungs.map((r, i) => (
            <li
              key={r.t}
              className="relative flex gap-4 rounded-2xl border border-line bg-surface p-5 sm:gap-6 sm:p-6"
            >
              <div className="flex flex-col items-center">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2">
                  <r.icon className="size-5 text-ink-muted" />
                </span>
                {i < rungs.length - 1 && (
                  <span aria-hidden="true" className="mt-2 w-px flex-1 bg-line" />
                )}
              </div>
  
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <h3 className="text-base font-semibold text-ink">{t(r.t)}</h3>
                  {/* Tag carries a word, not just a colour, for colour-blind readers. */}
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wider",
                      toneClass[r.tone],
                    )}
                  >
                    {t(r.tag)}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  {t(r.d)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Reveal>

      <p className="mt-6 flex items-start gap-3 rounded-xl border border-brand/25 bg-brand/5 p-4 text-sm leading-relaxed text-ink-muted">
        <Icons.beacon className="mt-0.5 size-4 shrink-0 text-brand" />
        {t("offline.queue")}
      </p>
    </Section>
  );
}

/* ----------------------------------------------------------------- drill -- */

function DrillSection() {
  const { t } = useLang();

  return (
    <Section id="drill">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <SectionHead
          eyebrow={t("drill.eyebrow")}
          title={t("drill.title")}
          sub={t("drill.sub")}
        />
        <SosDrill />
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- limits -- */

function HonestLimits() {
  const { t } = useLang();

  const items = [
    "limits.l1",
    "limits.l2",
    "limits.l3",
    "limits.l4",
    "limits.l5",
    "limits.l6",
  ] as const;

  return (
    <Section id="limits" className="border-y border-line bg-surface/30">
      <SectionHead
        eyebrow={t("limits.eyebrow")}
        title={t("limits.title")}
        sub={t("limits.sub")}
      />
      <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((base, i) => (
          <Card key={base} delay={(i % 3) * 80}>
            <h3 className="flex items-start gap-2.5 text-base font-semibold text-ink">
              <svg {...iconBase} className="mt-0.5 size-4 shrink-0 text-warn">
                <circle cx="12" cy="12" r="9" />
                <path d="M15 9 9 15M9 9l6 6" />
              </svg>
              {t(`${base}.t` as Key)}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              {t(`${base}.d` as Key)}
            </p>
          </Card>
        ))}
      </div>
    </Section>
  );
}

/* --------------------------------------------------------------- pricing -- */

function Pricing() {
  const { t } = useLang();

  const freeFeatures: Key[] = [
    "pricing.free.f1",
    "pricing.free.f2",
    "pricing.free.f3",
    "pricing.free.f4",
    "pricing.free.f5",
    "pricing.free.f6",
  ];
  const plusFeatures: Key[] = [
    "pricing.plus.f1",
    "pricing.plus.f2",
    "pricing.plus.f3",
    "pricing.plus.f4",
    "pricing.plus.f5",
    "pricing.plus.f6",
  ];

  return (
    <Section id="pricing">
      <SectionHead
        eyebrow={t("pricing.eyebrow")}
        title={t("pricing.title")}
        sub={t("pricing.sub")}
      />

      <div className="mt-12 grid gap-4 lg:grid-cols-2">
        <div className="lift rounded-2xl border-2 border-brand/50 bg-surface p-6 sm:p-8">
          <h3 className="text-lg font-semibold text-ink">
            {t("pricing.free.name")}
          </h3>
          <p className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-semibold text-brand">
              {t("pricing.free.price")}
            </span>
            <span className="text-sm text-ink-faint">
              {t("pricing.free.period")}
            </span>
          </p>
          <ul className="mt-6 flex flex-col gap-3">
            {freeFeatures.map((k) => (
              <FeatureRow key={k} tone="ok">
                {t(k)}
              </FeatureRow>
            ))}
          </ul>
          <Link
            href="#waitlist"
            className="mt-8 block rounded-xl bg-brand px-5 py-3 text-center text-sm font-semibold text-bg transition-colors hover:bg-brand/90"
          >
            {t("pricing.free.cta")}
          </Link>
        </div>

        <div className="lift rounded-2xl border border-line bg-surface p-6 hover:border-indigo/40 sm:p-8">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-ink">
              {t("pricing.plus.name")}
            </h3>
            <span className="rounded-full border border-indigo/40 px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wider text-indigo">
              {t("pricing.badge")}
            </span>
          </div>
          <p className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-semibold text-ink">
              {t("pricing.plus.price")}
            </span>
            <span className="text-sm text-ink-faint">
              {t("pricing.plus.period")}
            </span>
          </p>
          <ul className="mt-6 flex flex-col gap-3">
            {plusFeatures.map((k) => (
              <FeatureRow key={k} tone="indigo">
                {t(k)}
              </FeatureRow>
            ))}
          </ul>
          <Link
            href="#waitlist"
            className="mt-8 block rounded-xl border border-line bg-surface-2 px-5 py-3 text-center text-sm font-semibold text-ink transition-colors hover:border-indigo/60"
          >
            {t("pricing.plus.cta")}
          </Link>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-ink">
            {t("pricing.b2b.t")}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
            {t("pricing.b2b.d")}
          </p>
        </div>
        <Link
          href="#waitlist"
          className="shrink-0 rounded-xl border border-line bg-surface-2 px-5 py-3 text-center text-sm font-medium text-ink hover:border-brand/60"
        >
          {t("pricing.b2b.cta")}
        </Link>
      </div>
    </Section>
  );
}

function FeatureRow({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "ok" | "indigo";
}) {
  return (
    <li className="flex items-start gap-3 text-sm text-ink-muted">
      <svg
        {...iconBase}
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "ok" ? "text-ok" : "text-indigo",
        )}
      >
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}

/* ----------------------------------------------------------------- trust -- */

function Trust() {
  const { t } = useLang();

  const items = [
    { icon: Icons.lock, t: "trust.t1.t", d: "trust.t1.d" },
    { icon: Icons.chart, t: "trust.t2.t", d: "trust.t2.d" },
    { icon: Icons.shield, t: "trust.t3.t", d: "trust.t3.d" },
    { icon: Icons.phone, t: "trust.t4.t", d: "trust.t4.d" },
  ] as const;

  return (
    <Section className="border-y border-line bg-surface/30">
      <SectionHead
        eyebrow={t("trust.eyebrow")}
        title={t("trust.title")}
        sub={t("trust.sub")}
      />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it, i) => (
          <Card key={it.t} delay={i * 80}>
            <it.icon className="size-5 text-brand" />
            <h3 className="mt-4 text-base font-semibold text-ink">{t(it.t)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              {t(it.d)}
            </p>
          </Card>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------- faq -- */

function Faq() {
  const { t } = useLang();
  const pairs = [1, 2, 3, 4, 5, 6] as const;

  return (
    <Section id="faq">
      <SectionHead eyebrow={t("faq.eyebrow")} title={t("faq.title")} />
      <div className="mt-10 flex flex-col gap-3">
        {pairs.map((n) => (
          <details
            key={n}
            className="group rounded-xl border border-line bg-surface px-5 py-4 open:border-brand/40"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-ink">
              {t(`faq.q${n}` as Key)}
              <svg
                {...iconBase}
                className="size-4 shrink-0 text-ink-faint transition-transform group-open:rotate-45"
              >
                <path d="M12 5.5v13M5.5 12h13" />
              </svg>
            </summary>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-muted">
              {t(`faq.a${n}` as Key)}
            </p>
          </details>
        ))}
      </div>
    </Section>
  );
}

/* --------------------------------------------------------------- waitlist */

function Waitlist() {
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">(
    "idle",
  );
  const [note, setNote] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setStatus("error");
      setNote(t("cta.err"));
      return;
    }

    setStatus("sending");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, company }),
      });
      const body = (await res.json()) as { ok: boolean; stored: boolean };
      if (!res.ok || !body.ok) throw new Error("request failed");

      setStatus("ok");
      // Say plainly when the preview has no database behind it.
      setNote(body.stored ? t("cta.ok") : `${t("cta.ok")} ${t("cta.previewNote")}`);
      setEmail("");
    } catch {
      setStatus("error");
      setNote(t("cta.err"));
    }
  }

  return (
    <Section id="waitlist" className="border-t border-line">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-balance text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {t("cta.title")}
        </h2>
        <p className="mt-4 text-pretty text-base leading-relaxed text-ink-muted">
          {t("cta.sub")}
        </p>

        <form
          onSubmit={submit}
          className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row"
        >
          {/* Honeypot: invisible to people and screen readers, filled by bots. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
            <label>
              Company
              <input
                name="company"
                tabIndex={-1}
                autoComplete="off"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </label>
          </div>
          <label className="flex-1">
            <span className="sr-only">{t("cta.placeholder")}</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (status !== "idle") setStatus("idle");
              }}
              placeholder={t("cta.placeholder")}
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={status === "sending"}
            className="shine rounded-xl bg-brand px-6 py-3 text-base font-semibold text-bg transition-colors hover:bg-brand/90 disabled:opacity-60"
          >
            {t("cta.button")}
          </button>
        </form>

        <p
          aria-live="polite"
          className={cn(
            "mt-4 min-h-6 text-sm",
            status === "error" ? "text-warn" : "text-ok",
          )}
        >
          {note}
        </p>

        <p className="mt-2 text-xs text-ink-faint">{t("cta.privacy")}</p>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ page -- */

export function Landing() {
  return (
    <main>
      <Hero />
      <HowItWorks />
      <OfflineLadder />
      <Architecture />
      <DrillSection />
      <HonestLimits />
      <Pricing />
      <Trust />
      <Faq />
      <MakerTeaser />
      <Waitlist />
    </main>
  );
}
