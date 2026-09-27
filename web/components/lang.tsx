"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  dictionaries,
  locales,
  localeNames,
  type Key,
  type Locale,
} from "@/lib/i18n";

const STORAGE_KEY = "todu.locale";

function isLocale(value: string | null | undefined): value is Locale {
  return value != null && (locales as readonly string[]).includes(value);
}

/* The chosen locale is browser state, not React state: it lives in
 * localStorage and must survive a reload. useSyncExternalStore reads it with a
 * server snapshot of "en", so the server renders deterministically and the
 * client adopts the real preference on hydration without a setState effect. */

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): Locale {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Blocked storage must never break the page.
  }
  if (isLocale(stored)) return stored;

  const browser = navigator.language.slice(0, 2);
  return isLocale(browser) ? browser : "en";
}

function getServerSnapshot(): Locale {
  return "en";
}

function store(next: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Preference simply will not persist; the page still works.
  }
  for (const listener of listeners) listener();
}

type LangValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: Key, vars?: Record<string, string | number>) => string;
};

const LangContext = createContext<LangValue | null>(null);

export function LangProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => store(next), []);

  const value = useMemo<LangValue>(
    () => ({
      locale,
      setLocale,
      t: (key: Key, vars?: Record<string, string | number>) => {
        let text = dictionaries[locale][key];
        for (const [name, value] of Object.entries(vars ?? {})) {
          text = text.replaceAll(`{${name}}`, String(value));
        }
        return text;
      },
    }),
    [locale, setLocale],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside <LangProvider>");
  return ctx;
}

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useLang();

  return (
    <label className={`inline-flex items-center gap-2 ${className}`}>
      <span className="sr-only">{t("nav.language")}</span>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-4 shrink-0 text-ink-faint"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
      </svg>
      <select
        name="language"
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="cursor-pointer rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink hover:border-brand/60"
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {localeNames[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
