"use client";

import { useSyncExternalStore } from "react";
import { useLang } from "@/components/lang";

/* Light by default; dark or "match device" on request. A non-default choice
 * lives in localStorage and is applied as <html data-theme>, which the CSS
 * reads. THEME_SCRIPT applies it before first paint so a dark-mode reader
 * never sees a light flash. */

export const THEME_KEY = "todu.theme";
const themes = ["light", "dark", "system"] as const;
type Theme = (typeof themes)[number];

export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="dark"||t==="system")document.documentElement.dataset.theme=t}catch(e){}`;

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "system") return stored;
  } catch {
    // Blocked storage: the default.
  }
  return "light";
}

function apply(next: Theme): void {
  try {
    if (next === "light") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, next);
  } catch {
    // The choice will not persist, but still applies to this page.
  }
  if (next === "light") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = next;
  for (const listener of listeners) listener();
}

export function ThemeSwitcher({ className = "" }: { className?: string }) {
  const { t } = useLang();
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => "light" as Theme);

  return (
    <label className={`inline-flex items-center gap-2 ${className}`}>
      <span className="sr-only">{t("theme.label")}</span>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-4 shrink-0 text-ink-faint"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
      </svg>
      <select
        name="theme"
        value={theme}
        onChange={(e) => apply(e.target.value as Theme)}
        className="cursor-pointer rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink hover:border-brand/60"
      >
        {themes.map((th) => (
          <option key={th} value={th}>
            {t(`theme.${th}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
