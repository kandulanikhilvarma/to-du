"use client";

import Link from "next/link";
import { useState } from "react";
import { LanguageSwitcher, useLang } from "@/components/lang";
import { Reveal } from "@/components/motion";
import { ThemeSwitcher } from "@/components/theme";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Wordmark. The shield doubles as the app icon silhouette. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="size-6 text-brand"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2.5 4.5 5.8v5.6c0 4.6 3.1 8.3 7.5 10.1 4.4-1.8 7.5-5.5 7.5-10.1V5.8Z" />
        <path d="M12 8.2v4.4" />
        <path d="M12 15.6h.01" />
      </svg>
      <span className="text-lg font-semibold tracking-tight text-ink">Todu</span>
    </span>
  );
}

/** Keyboard users land on the page, not the navigation. */
export function SkipLink() {
  const { t } = useLang();
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:font-medium focus:text-bg"
    >
      {t("a11y.skip")}
    </a>
  );
}

const NAV = [
  { href: "/#how", key: "nav.how" },
  { href: "/#offline", key: "nav.offline" },
  { href: "/#architecture", key: "nav.arch" },
  { href: "/#limits", key: "nav.limits" },
  { href: "/#pricing", key: "nav.pricing" },
  { href: "/about", key: "nav.about" },
] as const;

export function SiteHeader() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" aria-label={t("a11y.home")} className="shrink-0">
          <Logo />
        </Link>

        <nav
          aria-label="Primary"
          className="ml-2 hidden items-center gap-1 lg:flex"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface hover:text-ink"
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher className="hidden sm:inline-flex" />
          <ThemeSwitcher className="hidden sm:inline-flex" />
          <Link
            href="/dashboard"
            className="hidden rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-brand/60 sm:inline-block"
          >
            {t("nav.dashboard")}
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="rounded-lg border border-line bg-surface p-2 text-ink lg:hidden"
          >
            <span className="sr-only">{t("nav.menu")}</span>
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              {open ? (
                <path d="M6 6l12 12M18 6 6 18" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="border-t border-line bg-surface px-4 py-3 lg:hidden"
        >
          <ul className="flex flex-col gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-2.5 text-sm text-ink-muted hover:bg-surface-2 hover:text-ink"
                >
                  {t(item.key)}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-2.5 text-sm text-ink-muted hover:bg-surface-2 hover:text-ink"
              >
                {t("nav.dashboard")}
              </Link>
            </li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-3 border-t border-line pt-3">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  const { t } = useLang();

  return (
    <footer className="border-t border-line bg-surface/40">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {/* The liability disclaimer is foregrounded, not buried in fine print. */}
        <div className="flex gap-3 rounded-xl border border-warn/30 bg-warn/5 p-4">
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-warn"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <path d="M12 8.5v5" />
            <path d="M12 16.5h.01" />
            <circle cx="12" cy="12" r="9" />
          </svg>
          <p className="text-sm leading-relaxed text-ink-muted">
            {t("footer.disclaimer")}
          </p>
        </div>

        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-3 text-sm text-ink-faint">{t("brand.tagline")}</p>
          </div>

          <FooterColumn title={t("footer.product")}>
            <FooterLink href="/#how">{t("nav.how")}</FooterLink>
            <FooterLink href="/#offline">{t("nav.offline")}</FooterLink>
            <FooterLink href="/#pricing">{t("nav.pricing")}</FooterLink>
            <FooterLink href="/dashboard">{t("nav.dashboard")}</FooterLink>
          </FooterColumn>

          <FooterColumn title={t("footer.company")}>
            <FooterLink href="/about">{t("nav.about")}</FooterLink>
            <FooterLink href="/#architecture">{t("nav.arch")}</FooterLink>
            <FooterLink href="/#limits">{t("nav.limits")}</FooterLink>
            <FooterLink href="/#faq">{t("nav.faq")}</FooterLink>
            <FooterLink href="https://github.com/kandulanikhilvarma/to-du">
              {t("footer.code")}
            </FooterLink>
            <FooterLink href="/api/health">{t("footer.status")}</FooterLink>
          </FooterColumn>

          <FooterColumn title={t("footer.legal")}>
            <FooterLink href="/legal/privacy">{t("footer.privacy")}</FooterLink>
            <FooterLink href="/legal/terms">{t("footer.terms")}</FooterLink>
            <FooterLink href="/legal/privacy#security">
              {t("footer.security")}
            </FooterLink>
          </FooterColumn>
        </div>

        <p className="mt-10 border-t border-line pt-6 text-xs text-ink-faint">
          Todu. {t("footer.rights")}
        </p>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
        {title}
      </h2>
      <ul className="mt-3 flex flex-col gap-2">{children}</ul>
    </div>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="text-sm text-ink-muted transition-colors hover:text-brand"
      >
        {children}
      </Link>
    </li>
  );
}

export function Section({
  id,
  children,
  className = "",
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn("scroll-mt-20 px-4 py-20 sm:px-6 sm:py-24", className)}
    >
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

export function SectionHead({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  return (
    <Reveal className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        {title}
      </h2>
      {sub && (
        <p className="mt-4 text-pretty text-base leading-relaxed text-ink-muted">
          {sub}
        </p>
      )}
    </Reveal>
  );
}

export function Card({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <Reveal
      delay={delay}
      className={cn(
        "rounded-2xl border border-line bg-surface p-6 hover:border-brand/40",
        className,
      )}
    >
      {children}
    </Reveal>
  );
}
