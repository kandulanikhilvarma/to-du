// Shared with the web design tokens. Deep red is reserved for the live SOS
// state; the resting app is teal so opening it never induces panic.
// Every text colour clears WCAG AA (4.5:1) on bg, surface and surface2.

import { useColorScheme } from "react-native";
import { useSettings } from "./settings";

export type Palette = {
  scheme: "dark" | "light";
  bg: string;
  surface: string;
  surface2: string;
  line: string;
  ink: string;
  inkMuted: string;
  inkFaint: string;
  brand: string;
  sos: string;
  warn: string;
  ok: string;
};

export const dark: Palette = {
  scheme: "dark",
  bg: "#07090c",
  surface: "#0e1218",
  surface2: "#151b24",
  line: "#232c38",
  ink: "#f2f5f8",
  inkMuted: "#9aa7b6",
  inkFaint: "#808c9c",
  brand: "#2dd4bf",
  sos: "#ef4444",
  warn: "#f59e0b",
  ok: "#34d399",
};

export const light: Palette = {
  scheme: "light",
  bg: "#f6f8fa",
  surface: "#ffffff",
  surface2: "#eef2f6",
  line: "#cfd8e3",
  ink: "#0b1220",
  inkMuted: "#44505f",
  inkFaint: "#5b6776",
  brand: "#0f766e",
  sos: "#c81e1e",
  warn: "#9a5b00",
  ok: "#047857",
};

export type Appearance = "system" | "light" | "dark";

export function pickPalette(
  appearance: Appearance,
  system: string | null | undefined,
): Palette {
  if (appearance === "light") return light;
  if (appearance === "dark") return dark;
  return system === "dark" ? dark : light;
}

/** The palette for the user's Appearance setting: light unless they chose
 *  dark, or chose to follow a phone that is in dark mode. */
export function useTheme(): Palette {
  const { appearance } = useSettings();
  return pickPalette(appearance, useColorScheme());
}
