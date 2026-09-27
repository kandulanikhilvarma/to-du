"use client";

import { Icons } from "@/components/icons";
import { useLang } from "@/components/lang";
import { CountUp, Reveal } from "@/components/motion";
import { Built, Monogram, REPO_URL } from "@/components/showcase";
import { Card, Section, SectionHead, cn } from "@/components/site";
import type { Key, Locale } from "@/lib/i18n";

type YM = readonly [number, number?];

function when(locale: Locale, [y, m]: YM): string {
  if (!m) return String(y);
  return new Intl.DateTimeFormat(`${locale}-IN`, {
    month: "short",
    year: "numeric",
  }).format(new Date(y, m - 1));
}

const FACTS = [
  { k: "about.f.based", v: "about.f.based.v" },
  { k: "about.f.now", v: "about.f.now.v" },
  { k: "about.f.shipped", v: "about.f.shipped.v" },
  { k: "about.f.open", v: "about.f.open.v" },
] as const;

const NUMBERS = [
  { n: 18, k: "about.n.months" },
  { n: 15, k: "about.n.projects" },
  { n: 6, k: "about.n.products" },
  { n: 1, k: "about.n.paper" },
] as const;

const PRINCIPLES = [1, 2, 3, 4, 5] as const;

const SKILLS = [
  { icon: Icons.phone, k: "about.k1", stack: "Expo · React Native · Kotlin config plugins" },
  { icon: Icons.database, k: "about.k2", stack: "Postgres · PostGIS · Supabase · pg_cron" },
  { icon: Icons.monitor, k: "about.k3", stack: "Next.js 16 · React 19 · Tailwind v4" },
  { icon: Icons.lock, k: "about.k4", stack: "RLS · least privilege · Vault" },
  { icon: Icons.check, k: "about.k5", stack: "88 tests · GitHub Actions · strict TypeScript" },
] as const;

type Kind = "build" | "study" | "research" | "work";

const ROUTE: ReadonlyArray<{
  kind: Kind;
  from: YM;
  to?: YM;
  now?: boolean;
  k: string;
  org: string;
}> = [
  { kind: "build", from: [2026, 9], now: true, k: "about.r.todu", org: "Todu" },
  { kind: "study", from: [2025, 10], to: [2027, 8], now: true, k: "about.r.msc", org: "FOM Hochschule" },
  { kind: "research", from: [2025, 3], k: "about.r.paper", org: "IRJMETS, Vol 7 Issue 3" },
  { kind: "work", from: [2024, 10], to: [2025, 12], k: "about.r.mi", org: "MicroIntech" },
  { kind: "work", from: [2024], to: [2025], k: "about.r.ep", org: "EngineeredPrompts" },
  { kind: "study", from: [2020], to: [2024], k: "about.r.btech", org: "Malla Reddy College of Engineering" },
];

const KIND_TONE: Record<Kind, string> = {
  build: "border-brand/50 text-brand",
  study: "border-indigo/50 text-indigo",
  research: "border-warn/50 text-warn",
  work: "border-ok/50 text-ok",
};

const LINKS = [
  { name: "GitHub", href: "https://github.com/kandulanikhilvarma", k: "about.l.github", icon: Icons.code },
  { name: "LinkedIn", href: "https://www.linkedin.com/in/nikhilvarmakandula", k: "about.l.linkedin", icon: Icons.people },
  { name: "kandula.studio", href: "https://kandula.studio", k: "about.l.site", icon: Icons.spark },
  { name: "Email", href: "mailto:kandulanikhilvarma@gmail.com", k: "about.l.email", icon: Icons.mail },
] as const;

function AboutHero() {
  const { t } = useLang();

  return (
    <section className="relative overflow-hidden px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
      <div
        aria-hidden="true"
        className="todu-drift pointer-events-none absolute -left-32 -top-40 size-[28rem] rounded-full bg-brand/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-6xl">
        <Reveal>
          <Monogram className="size-24" />
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-brand">
            {t("about.eyebrow")}
          </p>
          <h1 className="mt-3 max-w-3xl text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-6xl">
            {t("about.title")}
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-ink-muted">
            {t("about.lead")}
          </p>
        </Reveal>

        <dl className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map((f, i) => (
            <Reveal key={f.k} delay={i * 80} className="bg-surface px-5 py-5">
              <dt className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                {t(f.k)}
              </dt>
              <dd className="mt-1.5 text-sm font-medium text-ink">{t(f.v)}</dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Story() {
  const { t } = useLang();

  return (
    <Section className="border-y border-line bg-surface/30">
      <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
        <Reveal>
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {t("about.story.title")}
          </h2>
          <div className="mt-6 flex flex-col gap-4 text-base leading-relaxed text-ink-muted">
            <p>{t("about.bio1")}</p>
            <p>{t("about.bio2")}</p>
            <p>{t("about.bio3")}</p>
          </div>
        </Reveal>

        <div className="grid grid-cols-2 gap-4 self-start">
          {NUMBERS.map((n, i) => (
            <Reveal key={n.k} delay={i * 90}>
              <div className="lift h-full rounded-2xl border border-line bg-surface p-6 hover:border-brand/40">
                <CountUp to={n.n} className="text-4xl font-semibold text-brand sm:text-5xl" />
                <p className="mt-2 text-sm leading-snug text-ink-muted">{t(n.k)}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </Section>
  );
}

function Principles() {
  const { t } = useLang();

  return (
    <Section id="principles">
      <SectionHead
        eyebrow={t("about.p.eyebrow")}
        title={t("about.p.title")}
        sub={t("about.p.sub")}
      />
      <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PRINCIPLES.map((n, i) => (
          <li key={n} className={cn(n === 1 && "lg:col-span-2")}>
            <Card delay={i * 70} className="h-full">
              <span className="font-mono text-xs text-brand">
                {String(n).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-lg font-semibold text-ink">
                {t(`about.p${n}.t` as Key)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                {t(`about.p${n}.d` as Key)}
              </p>
            </Card>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Skills() {
  const { t } = useLang();

  return (
    <Section id="skills" className="border-y border-line bg-surface/30">
      <SectionHead
        eyebrow={t("about.k.eyebrow")}
        title={t("about.k.title")}
        sub={t("about.k.sub")}
      />
      <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {SKILLS.map((s, i) => (
          <Card key={s.k} delay={i * 70} className="flex flex-col">
            <s.icon className="size-5 text-brand" />
            <h3 className="mt-4 text-base font-semibold text-ink">
              {t(`${s.k}.t` as Key)}
            </h3>
            <p className="mt-1 font-mono text-[0.7rem] leading-relaxed text-ink-faint">
              {s.stack}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              {t(`${s.k}.d` as Key)}
            </p>
          </Card>
        ))}
      </div>
      <a
        href={REPO_URL}
        className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline"
      >
        {t("built.repo")}
        <Icons.arrow className="size-4" />
      </a>
    </Section>
  );
}

function Route() {
  const { t, locale } = useLang();

  return (
    <Section id="route">
      <SectionHead
        eyebrow={t("about.route.eyebrow")}
        title={t("about.route.title")}
      />
      <ol className="relative mt-12 ml-3 border-l border-line">
        {ROUTE.map((r, i) => (
          <li key={r.k} className="relative pb-10 pl-8 last:pb-0">
            <span
              aria-hidden="true"
              className={cn(
                "absolute -left-[7px] top-1.5 size-3.5 rounded-full border-2 bg-bg",
                KIND_TONE[r.kind],
              )}
            >
              {r.now && (
                <span className="todu-ring absolute inset-0 rounded-full border border-current" />
              )}
            </span>
            <Reveal delay={i * 60}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium tabular-nums text-ink-faint">
                  {when(locale, r.from)}
                  {r.to && ` – ${when(locale, r.to)}`}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 font-semibold uppercase tracking-wider",
                    KIND_TONE[r.kind],
                  )}
                >
                  {t(`about.kind.${r.kind}` as Key)}
                </span>
                {r.now && (
                  <span className="rounded-full bg-brand px-2 py-0.5 font-semibold uppercase tracking-wider text-bg">
                    {t("about.now")}
                  </span>
                )}
              </div>
              <h3 className="mt-2 text-lg font-semibold text-ink">
                {t(`${r.k}.t` as Key)}
              </h3>
              <p className="text-sm text-ink-faint">{r.org}</p>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
                {t(`${r.k}.d` as Key)}
              </p>
            </Reveal>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Elsewhere() {
  const { t } = useLang();

  return (
    <Section id="contact" className="border-t border-line">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
            {t("about.open.eyebrow")}
          </p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {t("about.open.title")}
          </h2>
          <p className="mt-4 text-pretty text-base leading-relaxed text-ink-muted">
            {t("about.open.body")}
          </p>
          <a
            href="mailto:kandulanikhilvarma@gmail.com"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-base font-semibold text-bg transition-colors hover:bg-brand/90"
          >
            <Icons.mail className="size-4" />
            {t("about.open.cta")}
          </a>
        </Reveal>

        <ul className="grid gap-3 sm:grid-cols-2">
          {LINKS.map((l, i) => (
            <li key={l.name}>
              <Reveal delay={i * 80} className="h-full">
                <a
                  href={l.href}
                  className="lift group flex h-full items-start gap-4 rounded-2xl border border-line bg-surface p-5 hover:border-brand/50"
                >
                  <l.icon className="mt-0.5 size-5 shrink-0 text-brand" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-base font-semibold text-ink">
                      {l.name}
                      <Icons.arrow className="size-3.5 text-ink-faint transition-transform group-hover:translate-x-1" />
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-ink-muted">
                      {t(l.k)}
                    </span>
                  </span>
                </a>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

export function About() {
  return (
    <main>
      <AboutHero />
      <Story />
      <Principles />
      <Skills />
      <Built />
      <Route />
      <Elsewhere />
    </main>
  );
}
