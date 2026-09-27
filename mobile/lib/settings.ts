// User settings. Plain preferences live in MMKV (synchronous, survives kills).
// PINs live in the OS keystore via SecureStore, never in plain storage.

import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { createMMKV } from "react-native-mmkv";
import type { Locale } from "./i18n";
import type { Appearance } from "./theme";

export type Contact = { name: string; phone: string };

export type Medical = {
  bloodGroup: string;
  allergies: string;
  medications: string;
};

export type Settings = {
  displayName: string;
  contacts: Contact[];
  medical: Medical;
  silentMode: boolean;
  countdownSeconds: number;
  locale: Locale;
  /** Carry SOS alerts heard from nearby Todu phones to the server. */
  relayForOthers: boolean;
  /** Light, dark, or follow the phone. */
  appearance: Appearance;
  /** Start the countdown on three hard shakes (while Todu is open). */
  shakeToTrigger: boolean;
  /** Start the countdown after free fall plus impact (while Todu is open). */
  fallDetection: boolean;
  /** Take one back-camera photo for the circle when an SOS goes out. */
  captureEvidence: boolean;
};

const DEFAULTS: Settings = {
  displayName: "",
  contacts: [],
  medical: { bloodGroup: "", allergies: "", medications: "" },
  silentMode: false,
  countdownSeconds: 8,
  locale: "en",
  relayForOthers: true,
  appearance: "light",
  shakeToTrigger: false,
  fallDetection: false,
  captureEvidence: false,
};

const kv = createMMKV({ id: "todu.settings" });
const KEY = "settings.v1";
const listeners = new Set<() => void>();
let cache: Settings | null = null;

export function getSettings(): Settings {
  if (cache) return cache;
  let stored: Partial<Settings> = {};
  const raw = kv.getString(KEY);
  if (raw) {
    try {
      stored = JSON.parse(raw) as Partial<Settings>;
    } catch {
      stored = {};
    }
  }
  cache = {
    ...DEFAULTS,
    ...stored,
    medical: { ...DEFAULTS.medical, ...stored.medical },
  };
  return cache;
}

export function updateSettings(patch: Partial<Settings>): void {
  cache = { ...getSettings(), ...patch };
  kv.set(KEY, JSON.stringify(cache));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings);
}

const CANCEL_PIN = "todu.pin.cancel";
const DURESS_PIN = "todu.pin.duress";

export type Pins = { cancelPin: string; duressPin: string };

export async function loadPins(): Promise<Pins> {
  const [cancelPin, duressPin] = await Promise.all([
    SecureStore.getItemAsync(CANCEL_PIN),
    SecureStore.getItemAsync(DURESS_PIN),
  ]);
  return { cancelPin: cancelPin ?? "", duressPin: duressPin ?? "" };
}

export async function savePins({ cancelPin, duressPin }: Pins): Promise<void> {
  await (cancelPin
    ? SecureStore.setItemAsync(CANCEL_PIN, cancelPin)
    : SecureStore.deleteItemAsync(CANCEL_PIN));
  await (duressPin
    ? SecureStore.setItemAsync(DURESS_PIN, duressPin)
    : SecureStore.deleteItemAsync(DURESS_PIN));
}
