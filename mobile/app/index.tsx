import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Battery from "expo-battery";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as Network from "expo-network";
import {
  Link,
  router,
  useFocusEffect,
  useRootNavigationState,
} from "expo-router";
import * as Linking from "expo-linking";
import { Accelerometer } from "expo-sensors";
import {
  beginEvent,
  broadcastEvent,
  eventResponders,
  uploadEvidence,
  hasBackend,
  markResolved,
  sendPing,
  type Fix,
} from "../lib/backend";
import { startBeacon, stopBeacon } from "../lib/beacon";
import { capturePhoto } from "../lib/torch";
import { translate, useT, type Key, type Translate } from "../lib/i18n";
import { dial112, runLadder, type Rung } from "../lib/ladder";
import { enqueue, size as queuedCount } from "../lib/queue";
import { broadcastSos } from "../lib/relay";
import { clearServerCheckIn, endLocalCheckIn, useCheckIn } from "../lib/checkin";
import { beginIncident, incidentEntries, logIncident } from "../lib/incident";
import { formatIncident } from "../lib/incident-core";
import { fallDetector, shakeDetector } from "../lib/motion-core";
import { responderEvents, type Responder } from "../lib/responders";
import { getSettings, loadPins, useSettings } from "../lib/settings";
import {
  reduce,
  type SosConfig,
  type SosContext,
  type SosEffect,
  type SosEvent,
} from "../lib/sos-machine";
import { loadSession, saveSession, type SosSession } from "../lib/sos-session";
import { useTheme, type Palette } from "../lib/theme";
import { startTracking, stopTracking, toFix } from "../lib/tracking";

const LIVE = new Set<SosContext["state"]>(["broadcasting", "acknowledged", "enroute"]);

const RUNG_KEY: Record<Rung, Key> = {
  realtime: "rung.realtime",
  sms: "rung.sms",
  dial112: "rung.dial112",
  ble: "rung.ble",
  beacon: "rung.beacon",
};

async function readFix(allowPrompt: boolean): Promise<Fix | null> {
  try {
    let perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted && allowPrompt) perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;
    // Indoors a fresh fix can take minutes. Cap the wait so the SMS step is
    // never held hostage by the sky, then fall back to the last known fix.
    // Google's "Location Accuracy" dialog only on the first, non-covert fix:
    // over a duress screen it would show an onlooker that something is running.
    const fresh = await Promise.race([
      // Declining that dialog rejects; fall through to the last known fix
      // instead of sending the SOS with no location at all.
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: allowPrompt,
      }).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    const pos = fresh ?? (await Location.getLastKnownPositionAsync());
    return pos ? toFix(pos) : null;
  } catch {
    return null;
  }
}

function responderLine(t: Translate, r: Responder): string {
  const name = r.name || t("resp.someone");
  if (r.status === "enroute") {
    return r.etaMinutes != null
      ? t("resp.enrouteEta", { name, n: r.etaMinutes })
      : t("resp.enroute", { name });
  }
  return t(`resp.${r.status}`, { name });
}

/** The launch link is read once per process, so a cancelled countdown is not
 *  restarted when the screen remounts. */
let initialLinkHandled = false;

function localT(): Translate {
  return (key, vars) => translate(getSettings().locale, key, vars);
}

/** One line per state change, so the shared timeline reads as a story. */
function logTransition(from: SosContext["state"], to: SosContext): void {
  if (from === to.state) return;
  const tr = localT();
  if (to.state === "countdown") beginIncident(tr("log.countdown"));
  else if (to.state === "false_alarm") logIncident(tr("log.cancelled"));
  else if (to.state === "broadcasting") logIncident(tr(to.covert ? "log.sentCovert" : "log.sent"));
  else if (to.state === "acknowledged") logIncident(tr("log.acknowledged"));
  else if (to.state === "enroute") logIncident(tr("log.enroute"));
  else if (to.state === "resolved") logIncident(tr("log.resolved"));
}

/** One photo for the circle. Never in duress mode, where Android's
 *  camera-in-use dot would show; every outcome goes in the timeline. */
async function captureEvidence(tr: Translate): Promise<void> {
  const uri = await capturePhoto();
  if (!uri) {
    logIncident(tr("log.photoNone"));
    return;
  }
  const failure = await uploadEvidence(uri);
  logIncident(failure ? tr("log.photoKept", { msg: failure }) : tr("log.photoUploaded"));
}

function shareTimeline(): void {
  const entries = incidentEntries();
  if (entries.length === 0) return;
  const tr = localT();
  const date = new Date(entries[0]!.t).toLocaleDateString();
  void Share.share({ message: formatIncident(tr("log.title", { date }), entries) });
}

async function readBattery(): Promise<number | null> {
  const level = await Battery.getBatteryLevelAsync().catch(() => -1);
  return level >= 0 ? Math.round(level * 100) : null;
}

export default function SosScreen() {
  const theme = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const t = useT();
  const settings = useSettings();

  const [session, setSession] = useState<SosSession>(loadSession);
  const sessionRef = useRef(session);
  const configRef = useRef<SosConfig>({ countdownSeconds: 8, cancelPin: "", duressPin: "" });
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const batterySub = useRef<{ remove: () => void } | null>(null);
  const relayTick = useRef<ReturnType<typeof setInterval> | null>(null);
  const dispatchRef = useRef<(event: SosEvent) => boolean>(() => false);

  const [hasCancelPin, setHasCancelPin] = useState(false);
  const [pin, setPin] = useState("");
  const [pinWrong, setPinWrong] = useState(false);
  const [covertPrompt, setCovertPrompt] = useState(false);
  const [working, setWorking] = useState(false);
  const [sirenOn, setSirenOn] = useState(false);
  const [holding, setHolding] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [queued, setQueued] = useState(0);
  const [responders, setResponders] = useState<Responder[]>([]);

  const commit = useCallback((next: SosSession) => {
    sessionRef.current = next;
    saveSession(next);
    setSession(next);
  }, []);

  const stopTick = useCallback(() => {
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
  }, []);

  const stopEverything = useCallback(() => {
    stopTick();
    stopBeacon();
    void stopTracking();
    batterySub.current?.remove();
    batterySub.current = null;
    if (relayTick.current) clearInterval(relayTick.current);
    relayTick.current = null;
    setSirenOn(false);
    setFlashing(false);
  }, [stopTick]);

  const watchBattery = useCallback(() => {
    batterySub.current?.remove();
    let sent = false;
    batterySub.current = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      if (sent || batteryLevel < 0 || batteryLevel > 0.1) return;
      sent = true;
      // Last chance before the phone dies: pin the final known position.
      void readFix(false).then(async (fix) => {
        if (!fix || !hasBackend()) return;
        const pct = Math.round(batteryLevel * 100);
        if (!(await sendPing(fix, pct))) {
          enqueue("ping", { fix, battery: pct, clientId: sessionRef.current.clientId });
        }
      });
    });
  }, []);

  const escalate = useCallback(
    async (covert: boolean) => {
      const s = getSettings();
      const tr: Translate = (key, vars) => translate(s.locale, key, vars);
      const clientId = sessionRef.current.clientId ?? Crypto.randomUUID();
      setWorking(true);
      beginEvent(clientId);

      const [fix, battery, net] = await Promise.all([
        readFix(!covert),
        readBattery(),
        Network.getNetworkStateAsync().catch(() => null),
      ]);
      const online = Boolean(net?.isConnected) && net?.isInternetReachable !== false;

      const rungs = await runLadder({
        contacts: s.contacts,
        fix,
        displayName: s.displayName,
        covert,
        silent: s.silentMode,
        t: tr,
        broadcast: () =>
          broadcastEvent(
            { clientId, fix, battery, silent: s.silentMode || covert, duress: covert },
            online,
          ),
        relay: () =>
          broadcastSos({
            cid: clientId,
            lat: fix?.lat ?? null,
            lng: fix?.lng ?? null,
            acc: fix?.accuracy ?? null,
            bat: battery,
            ts: Date.now(),
          }),
        startBeacon: async () => {
          const report = await startBeacon();
          setSirenOn(report.siren);
          return report;
        },
      });

      if (fix) {
        logIncident(
          tr("log.location", {
            lat: fix.lat.toFixed(5),
            lng: fix.lng.toFixed(5),
            acc: Math.round(fix.accuracy ?? 0),
          }),
        );
      }
      for (const r of rungs) {
        logIncident(`${r.delivered ? "✓" : "–"} ${tr(RUNG_KEY[r.rung])}: ${r.detail}`);
      }

      // The user may have marked safe while the ladder was still running.
      if (LIVE.has(sessionRef.current.context.state)) {
        commit({ ...sessionRef.current, rungs });
        await startTracking(covert, { title: tr("track.title"), body: tr("track.body") });
        watchBattery();
        if (!covert && s.captureEvidence) void captureEvidence(tr);
        if (!rungs.some((r) => r.rung === "realtime" && r.delivered)) {
          // No server has this SOS yet: keep offering it to any Todu phone
          // that comes into Bluetooth range. Same client id, so one event.
          if (relayTick.current) clearInterval(relayTick.current);
          relayTick.current = setInterval(() => {
            void readFix(false).then((f) =>
              broadcastSos({
                cid: clientId,
                lat: f?.lat ?? null,
                lng: f?.lng ?? null,
                acc: f?.accuracy ?? null,
                bat: null,
                ts: Date.now(),
              }),
            );
          }, 60_000);
        }
      } else {
        stopBeacon();
        setSirenOn(false);
      }
      setQueued(queuedCount());
      setWorking(false);
    },
    [commit, watchBattery],
  );

  const runEffect = useCallback(
    (effect: SosEffect, context: SosContext) => {
      switch (effect) {
        case "start_countdown":
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
          stopTick();
          tick.current = setInterval(() => dispatchRef.current({ type: "TICK" }), 1000);
          break;
        case "cancel_countdown":
          stopTick();
          // A cancelled countdown proves the person is fine, so a pending
          // server check-in must not alert the circle a minute later.
          void clearServerCheckIn();
          break;
        case "run_ladder":
          stopTick();
          void escalate(context.covert);
          break;
        case "stop_ladder":
          stopEverything();
          break;
        case "notify_resolved": {
          const { clientId } = sessionRef.current;
          if (!clientId || !hasBackend()) break;
          void markResolved(clientId).then((ok) => {
            if (!ok) enqueue("resolve", { clientId });
          });
          break;
        }
      }
    },
    [escalate, stopEverything, stopTick],
  );

  /** Pure reducer in, side effects out, once each. Returns false when the
   *  event caused no transition (for example a wrong PIN). */
  const dispatch = useCallback(
    (event: SosEvent): boolean => {
      const current = sessionRef.current;
      const config = { ...configRef.current, countdownSeconds: getSettings().countdownSeconds };
      const { context, effects } = reduce(current.context, event, config);
      if (context === current.context && effects.length === 0) return false;

      commit({
        context,
        rungs: effects.includes("run_ladder") ? [] : current.rungs,
        covertDismissed: context.covert ? current.covertDismissed : false,
        clientId: effects.includes("run_ladder")
          ? Crypto.randomUUID()
          : context.state === "armed"
            ? null
            : current.clientId,
      });
      logTransition(current.context.state, context);
      for (const effect of effects) runEffect(effect, context);
      return true;
    },
    [commit, runEffect],
  );

  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  // Resume after the app was killed mid-emergency.
  useEffect(() => {
    const { context, rungs } = sessionRef.current;
    const s = getSettings();
    if (context.state === "countdown") {
      runEffect("start_countdown", context);
    } else if (LIVE.has(context.state) && rungs.length === 0) {
      // Killed before the ladder finished (the first fix alone can take 8 s),
      // so the alert may never have been queued. Run it again under the same
      // client id: the server keeps one event however many copies arrive.
      runEffect("run_ladder", context);
    } else if (LIVE.has(context.state)) {
      void startTracking(context.covert, {
        title: translate(s.locale, "track.title"),
        body: translate(s.locale, "track.body"),
      });
      watchBattery();
    }
    return () => {
      stopTick();
      batterySub.current?.remove();
      if (relayTick.current) clearInterval(relayTick.current);
    };
  }, [runEffect, stopTick, watchBattery]);

  useFocusEffect(
    useCallback(() => {
      setQueued(queuedCount());
      void loadPins().then((pins) => {
        configRef.current = { ...configRef.current, ...pins };
        setHasCancelPin(pins.cancelPin !== "");
      });
    }, []),
  );

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  // Who is coming. Polled rather than streamed: a few rows every 15 s, and
  // it also moves the machine to acknowledged / enroute for the UI.
  const liveNow = LIVE.has(session.context.state);
  useEffect(() => {
    if (!liveNow || !hasBackend()) return;
    const poll = () =>
      void eventResponders().then((list) => {
        setResponders(list);
        for (const e of responderEvents(sessionRef.current.context.state, list)) {
          dispatchRef.current(e);
        }
      });
    poll();
    const id = setInterval(poll, 15_000);
    return () => {
      clearInterval(id);
      setResponders([]);
    };
  }, [liveNow]);

  useEffect(() => {
    if (!flashing || reduceMotion) return;
    // About 1.7 flashes a second: under the WCAG 2.3.1 limit of three.
    const id = setInterval(() => setFlashOn((on) => !on), 600);
    return () => clearInterval(id);
  }, [flashing, reduceMotion]);

  const trigger = useCallback(() => {
    setPin("");
    setPinWrong(false);
    dispatch({ type: "TRIGGER" });
  }, [dispatch]);

  // Shake and fall only start the countdown, never the alert itself, and only
  // while Todu is open: a background accelerometer would need a foreground
  // service running all day, which Android and Play both penalise.
  // expo-router throws if asked to navigate before the root navigator mounts,
  // which is exactly when a cold start from the tile or widget arrives. The
  // app opens on this screen anyway, so starting the countdown never waits.
  const navReady = Boolean(useRootNavigationState()?.key);

  const { shakeToTrigger, fallDetection } = settings;
  useEffect(() => {
    if (!shakeToTrigger && !fallDetection) return;
    const shake = shakeDetector();
    const fall = fallDetector();
    Accelerometer.setUpdateInterval(50);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const sample = { x, y, z, t: Date.now() };
      const shook = shakeToTrigger && shake(sample);
      const fell = fallDetection && fall(sample);
      if ((shook || fell) && sessionRef.current.context.state === "armed") {
        if (navReady) router.navigate("/");
        trigger();
      }
    });
    return () => sub.remove();
  }, [shakeToTrigger, fallDetection, trigger, navReady]);

  // The Quick Settings tile and home-screen widget open todu:///?trigger=...
  // They start the countdown, never the alert, so a pocket tap can be
  // cancelled. Read through Linking, not router params: on a cold start the
  // router is not ready to have its params cleared, and must not be touched.
  useEffect(() => {
    const handle = (url: string | null) => {
      if (url?.includes("trigger=") && sessionRef.current.context.state === "armed") trigger();
    };
    if (!initialLinkHandled) {
      initialLinkHandled = true;
      void Linking.getInitialURL().then(handle);
    }
    const sub = Linking.addEventListener("url", ({ url }) => handle(url));
    return () => sub.remove();
  }, [trigger]);

  // A missed check-in starts the countdown, so a person who is fine can still
  // cancel it. Checked every 15 s and on open; the local notification covers
  // a backgrounded app and the server covers a dead phone.
  const checkInDeadline = useCheckIn();
  useEffect(() => {
    if (checkInDeadline === null) return;
    const check = () => {
      if (Date.now() < checkInDeadline) return;
      void endLocalCheckIn();
      if (sessionRef.current.context.state === "armed") {
        if (navReady) router.navigate("/");
        trigger();
      }
    };
    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, [checkInDeadline, trigger, navReady]);

  const submitCancel = useCallback(() => {
    const changed = dispatch({ type: "CANCEL", pin: hasCancelPin ? pin : undefined });
    setPin("");
    setPinWrong(!changed);
  }, [dispatch, hasCancelPin, pin]);

  const submitCovertStop = useCallback(() => {
    const ok = pin !== "" && pin === configRef.current.cancelPin;
    setPin("");
    setCovertPrompt(false);
    if (ok) dispatch({ type: "SAFE" });
  }, [dispatch, pin]);

  const { context, rungs } = session;
  const live = LIVE.has(context.state);
  // Duress: the screen shows an ordinary cancel while the ladder runs.
  const view =
    context.covert && live
      ? session.covertDismissed
        ? "armed"
        : "false_alarm"
      : context.state;

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        {view === "armed" && (
          <>
            {/* Hidden gesture to end a covert alert. Deliberately not exposed
                as a control: an observer must not learn it exists. */}
            <Pressable
              accessible={false}
              onLongPress={context.covert ? () => setCovertPrompt(true) : undefined}
              delayLongPress={3000}
            >
              <Text style={s.title} accessibilityRole="header">
                {t("sos.title")}
              </Text>
            </Pressable>
            <Text style={s.sub}>{t("sos.hint", { n: settings.countdownSeconds })}</Text>

            {covertPrompt ? (
              <View style={s.pinBox}>
                <TextInput
                  value={pin}
                  onChangeText={setPin}
                  secureTextEntry
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder={t("sos.covertPin")}
                  placeholderTextColor={theme.inkFaint}
                  accessibilityLabel={t("sos.covertPin")}
                  style={s.input}
                  autoFocus
                />
                <Pressable style={s.secondary} onPress={submitCovertStop} accessibilityRole="button">
                  <Text style={s.secondaryLabel}>{t("sos.pinSubmit")}</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={[s.big, holding ? s.bigHolding : s.bigIdle]}
                onPressIn={() => setHolding(true)}
                onPressOut={() => setHolding(false)}
                onLongPress={context.covert ? undefined : trigger}
                delayLongPress={600}
                accessibilityRole="button"
                accessibilityLabel={t("sos.holdA11y")}
                accessibilityActions={[{ name: "activate", label: t("sos.hold") }]}
                onAccessibilityAction={(e) => {
                  if (e.nativeEvent.actionName === "activate" && !context.covert) trigger();
                }}
              >
                <Text style={s.bigLabel}>{t("sos.hold")}</Text>
              </Pressable>
            )}

            {settings.contacts.length === 0 && (
              <Link href="/circle" style={s.nudge}>
                {t("sos.noContacts")}
              </Link>
            )}
            {queued > 0 && <Text style={s.note}>{t("sos.queued", { n: queued })}</Text>}
          </>
        )}

        {view === "countdown" && (
          <>
            <Text style={s.title} accessibilityRole="header">
              {t("sos.sendingIn")}
            </Text>
            <View
              style={[s.big, s.bigLive]}
              accessibilityRole="timer"
              accessibilityLiveRegion="assertive"
            >
              <Text style={s.count}>{context.secondsRemaining}</Text>
            </View>

            {hasCancelPin ? (
              <View style={s.pinBox}>
                <Text style={s.sub}>{t("sos.pinPrompt")}</Text>
                <TextInput
                  value={pin}
                  onChangeText={setPin}
                  secureTextEntry
                  keyboardType="number-pad"
                  maxLength={6}
                  accessibilityLabel={t("sos.pinPrompt")}
                  style={s.input}
                  autoFocus
                  onSubmitEditing={submitCancel}
                />
                <Pressable style={s.secondary} onPress={submitCancel} accessibilityRole="button">
                  <Text style={s.secondaryLabel}>{t("sos.pinSubmit")}</Text>
                </Pressable>
                {pinWrong && (
                  <Text style={s.warn} accessibilityLiveRegion="polite">
                    {t("sos.pinWrong")}
                  </Text>
                )}
              </View>
            ) : (
              <Pressable style={s.secondary} onPress={submitCancel} accessibilityRole="button">
                <Text style={s.secondaryLabel}>{t("sos.cancel")}</Text>
              </Pressable>
            )}
          </>
        )}

        {view === "false_alarm" && (
          <>
            <Text style={s.title} accessibilityRole="header">
              {t("sos.cancelled")}
            </Text>
            <Text style={s.sub}>{t("sos.cancelledBody")}</Text>
            <Pressable
              style={s.secondary}
              accessibilityRole="button"
              onPress={() =>
                context.covert
                  ? commit({ ...sessionRef.current, covertDismissed: true })
                  : dispatch({ type: "REARM" })
              }
            >
              <Text style={s.secondaryLabel}>{t("sos.done")}</Text>
            </Pressable>
          </>
        )}

        {live && !context.covert && (
          <>
            <Text style={[s.title, { color: theme.sos }]} accessibilityRole="header">
              {t("sos.active")}
            </Text>

            <Pressable style={s.dial} onPress={() => void dial112()} accessibilityRole="button">
              <Text style={s.dialLabel}>{t("sos.call112")}</Text>
            </Pressable>

            {responders.length > 0 && (
              <>
                <Text style={s.section}>{t("resp.heading")}</Text>
                {responders.map((r, i) => (
                  <View key={`${r.name}-${i}`} style={s.rung} accessible>
                    <Text
                      style={[s.mark, { color: r.status === "notified" ? theme.inkFaint : theme.ok }]}
                    >
                      {r.status === "notified" ? "…" : "✓"}
                    </Text>
                    <Text style={[s.rungName, { flex: 1 }]}>{responderLine(t, r)}</Text>
                  </View>
                ))}
              </>
            )}

            <Text style={s.section}>{working ? t("sos.running") : t("sos.ladder")}</Text>
            {rungs.map((r) => (
              <View
                key={r.rung}
                style={s.rung}
                accessible
                accessibilityLabel={`${t(RUNG_KEY[r.rung])}. ${r.detail}`}
              >
                <Text style={[s.mark, { color: r.delivered ? theme.ok : theme.inkFaint }]}>
                  {r.delivered ? "✓" : "–"}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.rungName}>{t(RUNG_KEY[r.rung])}</Text>
                  <Text style={s.rungDetail}>{r.detail}</Text>
                </View>
              </View>
            ))}

            <View style={s.row}>
              {sirenOn && (
                <Pressable
                  style={[s.secondary, s.half]}
                  accessibilityRole="button"
                  onPress={() => {
                    stopBeacon();
                    setSirenOn(false);
                  }}
                >
                  <Text style={s.secondaryLabel}>{t("sos.stopSiren")}</Text>
                </Pressable>
              )}
              {!settings.silentMode && (
                <Pressable
                  style={[s.secondary, s.half]}
                  accessibilityRole="button"
                  onPress={() => setFlashing(true)}
                >
                  <Text style={s.secondaryLabel}>{t("sos.flash")}</Text>
                </Pressable>
              )}
            </View>

            <Pressable
              style={s.secondary}
              onPress={() => dispatch({ type: "SAFE" })}
              accessibilityRole="button"
            >
              <Text style={s.secondaryLabel}>{t("sos.safe")}</Text>
            </Pressable>
          </>
        )}

        {view === "resolved" && (
          <>
            <Text style={s.title} accessibilityRole="header">
              {t("sos.safeTitle")}
            </Text>
            <Text style={s.sub}>{t("sos.safeBody")}</Text>
            <Pressable style={s.secondary} onPress={shareTimeline} accessibilityRole="button">
              <Text style={s.secondaryLabel}>{t("sos.share")}</Text>
            </Pressable>
            <Pressable
              style={s.secondary}
              onPress={() => dispatch({ type: "REARM" })}
              accessibilityRole="button"
            >
              <Text style={s.secondaryLabel}>{t("sos.done")}</Text>
            </Pressable>
          </>
        )}

        <Text style={s.disclaimer}>{t("sos.disclaimer")}</Text>

        {checkInDeadline !== null && view === "armed" && (
          <Link href="/checkin" style={s.nudge}>
            {t("checkin.banner", {
              time: new Date(checkInDeadline).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            })}
          </Link>
        )}

        <View style={s.links}>
          <Link href="/checkin" style={s.link}>
            {t("nav.checkin")}
          </Link>
          <Link href="/fakecall" style={s.link}>
            {t("nav.fakecall")}
          </Link>
          <Link href="/circle" style={s.link}>
            {t("nav.circle")}
          </Link>
          <Link href="/profile" style={s.link}>
            {t("nav.profile")}
          </Link>
          <Link href="/settings" style={s.link}>
            {t("nav.settings")}
          </Link>
        </View>
      </ScrollView>

      {flashing && (
        <Pressable
          style={[
            StyleSheet.absoluteFill,
            s.flash,
            { backgroundColor: reduceMotion || flashOn ? "#ffffff" : theme.sos },
          ]}
          onPress={() => setFlashing(false)}
          accessibilityRole="button"
          accessibilityLabel={t("sos.flashStop")}
        >
          <Text style={s.flashLabel}>{t("sos.flashStop")}</Text>
        </Pressable>
      )}
    </View>
  );
}

function makeStyles(theme: Palette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bg },
    page: { padding: 24, gap: 16, alignItems: "center", flexGrow: 1 },
    title: {
      color: theme.ink,
      fontSize: 26,
      fontWeight: "600",
      textAlign: "center",
      marginTop: 12,
    },
    sub: { color: theme.inkMuted, fontSize: 15, textAlign: "center", lineHeight: 21 },
    section: {
      alignSelf: "stretch",
      color: theme.inkFaint,
      fontSize: 13,
      fontWeight: "600",
      textTransform: "uppercase",
      marginTop: 8,
    },
    big: {
      width: 240,
      height: 240,
      borderRadius: 120,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 4,
      marginVertical: 16,
    },
    bigIdle: { borderColor: "rgba(239,68,68,0.5)", backgroundColor: "rgba(239,68,68,0.1)" },
    bigHolding: { borderColor: theme.sos, backgroundColor: "rgba(239,68,68,0.22)" },
    bigLive: { borderColor: theme.sos, backgroundColor: "rgba(239,68,68,0.15)" },
    bigLabel: {
      color: theme.ink,
      fontSize: 19,
      fontWeight: "600",
      textAlign: "center",
      paddingHorizontal: 28,
    },
    count: { color: theme.ink, fontSize: 80, fontWeight: "600" },
    pinBox: { alignSelf: "stretch", gap: 10 },
    input: {
      borderWidth: 1,
      borderColor: theme.line,
      backgroundColor: theme.surface,
      color: theme.ink,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 22,
      letterSpacing: 8,
      textAlign: "center",
    },
    warn: { color: theme.warn, fontSize: 14, textAlign: "center" },
    secondary: {
      borderWidth: 1,
      borderColor: theme.line,
      backgroundColor: theme.surface2,
      borderRadius: 14,
      minHeight: 56,
      paddingHorizontal: 24,
      alignSelf: "stretch",
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryLabel: { color: theme.ink, fontSize: 17, fontWeight: "600" },
    row: { flexDirection: "row", gap: 12, alignSelf: "stretch" },
    half: { flex: 1, alignSelf: "auto" },
    dial: {
      backgroundColor: theme.sos,
      borderRadius: 14,
      minHeight: 64,
      alignSelf: "stretch",
      alignItems: "center",
      justifyContent: "center",
    },
    dialLabel: { color: "#fff", fontSize: 20, fontWeight: "700" },
    rung: {
      alignSelf: "stretch",
      flexDirection: "row",
      gap: 12,
      borderWidth: 1,
      borderColor: theme.line,
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 12,
    },
    mark: { fontSize: 18, fontWeight: "700", width: 18, textAlign: "center" },
    rungName: { color: theme.ink, fontSize: 15, fontWeight: "600" },
    rungDetail: { color: theme.inkMuted, fontSize: 13, marginTop: 2, lineHeight: 18 },
    nudge: { color: theme.warn, fontSize: 14, textAlign: "center", textDecorationLine: "underline" },
    note: { color: theme.inkFaint, fontSize: 13, textAlign: "center" },
    disclaimer: {
      color: theme.inkFaint,
      fontSize: 12,
      textAlign: "center",
      marginTop: "auto",
      paddingTop: 24,
    },
    links: { flexDirection: "row", gap: 20, flexWrap: "wrap", justifyContent: "center" },
    link: { color: theme.brand, fontSize: 15, paddingVertical: 10 },
    flash: { alignItems: "center", justifyContent: "flex-end", paddingBottom: 64 },
    flashLabel: {
      color: "#000",
      backgroundColor: "rgba(255,255,255,0.85)",
      fontSize: 16,
      fontWeight: "600",
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      overflow: "hidden",
    },
  });
}
