// The fallback ladder (spec S2). Each rung reports whether it actually
// delivered, in the words shown to the user. Nothing here claims success it
// did not observe (CLAUDE.md non-negotiable 2).
//
// Covert mode (duress PIN) must leave the screen looking cancelled and make no
// sound, so it skips the SMS composer and the beacon. Silent mode only drops
// noise and flashing: the composer is silent, and dropping it would leave an
// offline silent user with no way to reach anyone.

import * as Linking from "expo-linking";
import * as SMS from "expo-sms";
import type { BroadcastOutcome, Fix } from "./backend";
import type { BeaconReport } from "./beacon";
import type { Key, Translate } from "./i18n";
import type { BroadcastResult } from "./relay";
import type { Contact } from "./settings";

export type Rung = "realtime" | "sms" | "dial112" | "ble" | "beacon";

export type RungResult = { rung: Rung; delivered: boolean; detail: string };

export type LadderInput = {
  contacts: Contact[];
  fix: Fix | null;
  displayName: string;
  covert: boolean;
  silent: boolean;
  t: Translate;
  broadcast: () => Promise<BroadcastOutcome>;
  relay: () => Promise<BroadcastResult>;
  startBeacon: () => Promise<BeaconReport>;
};

const BLE: Record<BroadcastResult, Key> = {
  sent: "d.bleSent",
  unconfigured: "d.bleUnconfigured",
  not_running: "d.bleNotRunning",
  no_identity: "d.bleNoIdentity",
  failed: "d.bleFailed",
};

const OUTCOME: Record<BroadcastOutcome, Key> = {
  sent: "d.serverSent",
  offline: "d.noData",
  unconfigured: "d.unconfigured",
  signed_out: "d.signedOut",
  rejected: "d.rejected",
};

export function emergencyMessage(t: Translate, displayName: string, fix: Fix | null): string {
  const where = fix
    ? t("sms.where", { url: `https://maps.google.com/?q=${fix.lat},${fix.lng}` })
    : t("sms.noWhere");
  return t("sms.body", { name: displayName || t("sms.someone"), where });
}

async function smsRung(input: LadderInput): Promise<RungResult> {
  const { t } = input;
  if (input.covert) return { rung: "sms", delivered: false, detail: t("d.covert") };
  if (input.contacts.length === 0) {
    return { rung: "sms", delivered: false, detail: t("d.smsNoContacts") };
  }
  if (!(await SMS.isAvailableAsync().catch(() => false))) {
    return { rung: "sms", delivered: false, detail: t("d.smsUnavailable") };
  }

  // Neither store allows a silent send, so this opens a pre-filled composer.
  const { result } = await SMS.sendSMSAsync(
    input.contacts.map((c) => c.phone),
    emergencyMessage(t, input.displayName, input.fix),
  );
  // Android reports "unknown" once the composer hands off; only "sent" is proof.
  return result === "sent"
    ? { rung: "sms", delivered: true, detail: t("d.smsSent") }
    : { rung: "sms", delivered: false, detail: t("d.smsClosed") };
}

/** The mesh gives no delivery receipt, so even a successful broadcast is
 *  reported as sent, never as delivered. Covert mode still broadcasts: it
 *  shows nothing on screen and makes no sound. */
async function bleRung(input: LadderInput): Promise<RungResult> {
  const result = await input.relay().catch((): BroadcastResult => "failed");
  return { rung: "ble", delivered: false, detail: input.t(BLE[result]) };
}

async function beaconRung(input: LadderInput): Promise<RungResult> {
  const { t } = input;
  if (input.covert) return { rung: "beacon", delivered: false, detail: t("d.covert") };
  if (input.silent) return { rung: "beacon", delivered: false, detail: t("d.silent") };

  const report = await input.startBeacon();
  const parts = [
    report.siren ? t("d.sirenOn") : t("d.sirenFailed"),
    ...(report.haptics ? [t("d.hapticsOn")] : []),
    report.torch ? t("d.torchOn") : t("d.torchOff"),
  ];
  return {
    rung: "beacon",
    delivered: report.siren || report.haptics || report.torch,
    detail: parts.join(", "),
  };
}

export async function runLadder(input: LadderInput): Promise<RungResult[]> {
  const { t } = input;
  const outcome = await input.broadcast().catch((): BroadcastOutcome => "rejected");

  const results: RungResult[] = [
    { rung: "realtime", delivered: outcome === "sent", detail: t(OUTCOME[outcome]) },
  ];

  // The composer runs even when the broadcast succeeded: server SMS waits on
  // DLT registration, and the phone cannot see whether it went out.
  results.push(await smsRung(input));
  results.push({ rung: "dial112", delivered: false, detail: t("d.dialReady") });
  results.push(await bleRung(input));
  results.push(await beaconRung(input));
  return results;
}

export function dial112(): Promise<void> {
  return Linking.openURL("tel:112").then(() => undefined);
}
