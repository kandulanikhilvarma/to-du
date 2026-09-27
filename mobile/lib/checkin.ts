// Check-in timer: "if I have not checked in by then, start an SOS".
//
// Three layers, each honest about what it covers:
//   1. The SOS screen starts the countdown at the deadline while Todu runs.
//   2. Local notifications (5 min before, and at the deadline) reach a
//      backgrounded or killed app. Android Doze can delay them by minutes.
//   3. Signed in, the deadline is also on the server, and pg_cron alerts the
//      circle if it passes: the only layer that works with the phone off.

import * as Notifications from "expo-notifications";
import { useSyncExternalStore } from "react";
import { createMMKV } from "react-native-mmkv";
import { setServerCheckIn } from "./backend";
import type { Translate } from "./i18n";

const kv = createMMKV({ id: "todu.checkin" });
const listeners = new Set<() => void>();

export function getDeadline(): number | null {
  return kv.getNumber("deadline") ?? null;
}

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCheckIn(): number | null {
  return useSyncExternalStore(subscribe, getDeadline);
}

async function cancelNotifications(): Promise<void> {
  const raw = kv.getString("notifications");
  kv.remove("notifications");
  const ids = raw ? (JSON.parse(raw) as string[]) : [];
  await Promise.all(
    ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)),
  );
}

async function schedule(deadline: number, t: Translate): Promise<void> {
  const at = (date: number, title: string, body: string) =>
    Notifications.scheduleNotificationAsync({
      content: { title, body, priority: Notifications.AndroidNotificationPriority.MAX },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: "sos" },
    }).catch(() => null);
  const ids = await Promise.all([
    deadline - Date.now() > 6 * 60_000
      ? at(deadline - 5 * 60_000, t("checkin.remindTitle"), t("checkin.remindBody"))
      : Promise.resolve(null),
    at(deadline, t("checkin.dueTitle"), t("checkin.dueBody")),
  ]);
  kv.set("notifications", JSON.stringify(ids.filter((id): id is string => id !== null)));
}

/** What the server copy should be, kept until the server confirms it. Without
 *  this, checking in while offline left the old deadline on the server and
 *  pg_cron alerted the circle about someone who was fine. */
function syncServer(deadline: number | null): Promise<boolean> {
  kv.set("serverWant", JSON.stringify(deadline));
  return retryServerCheckIn();
}

/** Called again whenever a connection returns. */
export async function retryServerCheckIn(): Promise<boolean> {
  const raw = kv.getString("serverWant");
  if (raw === undefined) return true;
  const want = JSON.parse(raw) as number | null;
  // A deadline that passed before the server heard of it was already handled
  // on the phone; sending it now would fire a stale alert on arrival.
  const ok = want !== null && want <= Date.now() ? true : await setServerCheckIn(want);
  if (ok && kv.getString("serverWant") === raw) kv.remove("serverWant");
  return ok;
}

/** Start or move the deadline. Returns whether the server also holds it. */
export async function setCheckIn(deadline: number, t: Translate): Promise<boolean> {
  kv.set("deadline", deadline);
  notify();
  await cancelNotifications();
  await schedule(deadline, t);
  return syncServer(deadline);
}

export function startCheckIn(minutes: number, t: Translate): Promise<boolean> {
  return setCheckIn(Date.now() + minutes * 60_000, t);
}

/** The person checked in: nothing fires anywhere. */
export async function checkIn(): Promise<void> {
  kv.remove("deadline");
  notify();
  await cancelNotifications();
  await syncServer(null);
}

/** The deadline passed on the phone. Clears the local timer but leaves the
 *  server copy: cancelling the countdown that follows proves the person is
 *  fine (clearServerCheckIn), and if they cannot, the phone's own SOS is
 *  already live and the server skips its duplicate. */
export async function endLocalCheckIn(): Promise<void> {
  kv.remove("deadline");
  notify();
  await cancelNotifications();
}

export function clearServerCheckIn(): Promise<boolean> {
  return syncServer(null);
}
