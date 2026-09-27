// Live location during an active SOS: the breadcrumb trail responders follow.
//
// With background permission, updates run as a location task behind an
// Android foreground service, so they survive the screen locking. Otherwise
// they fall back to a foreground watch. Covert mode never starts the
// foreground service: its persistent notification would reveal the alert.

import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { currentClientId, hasBackend, sendPing, type Fix } from "./backend";
import { enqueue } from "./queue";

export const TRACKING_TASK = "todu.sos-tracking";

export type TrackingMode = "background" | "foreground" | "off";

type TaskData = { locations: Location.LocationObject[] };

export function toFix(pos: Location.LocationObject): Fix {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? null,
  };
}

async function record(fix: Fix): Promise<void> {
  // Without a server there is nobody to stream to; queueing would only grow.
  if (!hasBackend()) return;
  if (!(await sendPing(fix, null))) {
    enqueue("ping", { fix, battery: null, clientId: currentClientId() });
  }
}

// Module scope on purpose: the OS may start this task headless after a kill.
TaskManager.defineTask<TaskData>(TRACKING_TASK, async ({ data, error }) => {
  const last = data?.locations.at(-1);
  if (!error && last) await record(toFix(last));
});

let foreground: Location.LocationSubscription | null = null;

const UPDATE = {
  accuracy: Location.Accuracy.High,
  // The first fix already offered it; tracking also runs in covert mode.
  mayShowUserSettingsDialog: false,
  timeInterval: 30_000,
  distanceInterval: 20,
};

export async function startTracking(
  covert: boolean,
  notice: { title: string; body: string },
): Promise<TrackingMode> {
  await stopTracking();
  try {
    if (!covert && (await Location.getBackgroundPermissionsAsync()).granted) {
      await Location.startLocationUpdatesAsync(TRACKING_TASK, {
        ...UPDATE,
        showsBackgroundLocationIndicator: true,
        foregroundService: { notificationTitle: notice.title, notificationBody: notice.body },
      });
      return "background";
    }
    if (!(await Location.getForegroundPermissionsAsync()).granted) return "off";
    foreground = await Location.watchPositionAsync(UPDATE, (pos) => void record(toFix(pos)));
    return "foreground";
  } catch {
    return "off";
  }
}

export async function stopTracking(): Promise<void> {
  foreground?.remove();
  foreground = null;
  const running = await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK).catch(() => false);
  if (running) await Location.stopLocationUpdatesAsync(TRACKING_TASK).catch(() => undefined);
}
