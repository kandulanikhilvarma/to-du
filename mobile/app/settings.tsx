import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Camera } from "expo-camera";
import * as Device from "expo-device";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useFocusEffect } from "expo-router";
import { sendOtp, signOut, supabase, syncProfile, verifyOtp } from "../lib/backend";
import { localeNames, locales, useT, type Key } from "../lib/i18n";
import { normalizePhone } from "../lib/phone";
import { validatePins, type PinError } from "../lib/pin-rules";
import { pushState, registerForPush } from "../lib/push";
import { size as queuedCount } from "../lib/queue";
import { relayStatus } from "../lib/relay";
import { getSettings, loadPins, savePins, updateSettings, useSettings } from "../lib/settings";
import { useTheme, type Appearance, type Palette } from "../lib/theme";

const COUNTDOWNS = [5, 8, 10, 15];
const APPEARANCES: Appearance[] = ["light", "dark", "system"];

const PIN_ERROR: Record<PinError, Key> = {
  format: "pin.format",
  duressNeedsCancel: "pin.duressNeedsCancel",
  same: "pin.same",
};

// Vendors with a dedicated dontkillmyapp.com guide. Xiaomi, Realme, Oppo and
// Vivo dominate India and are the most aggressive background killers.
const OEM_GUIDES = new Set([
  "xiaomi",
  "redmi",
  "poco",
  "realme",
  "oppo",
  "vivo",
  "oneplus",
  "samsung",
  "huawei",
  "honor",
  "motorola",
  "asus",
  "nokia",
  "sony",
  "lenovo",
  "tecno",
  "infinix",
]);

function oemGuideUrl(brand: string): string {
  const slug = brand.toLowerCase();
  const vendor = ["redmi", "poco"].includes(slug) ? "xiaomi" : slug;
  return OEM_GUIDES.has(slug) ? `https://dontkillmyapp.com/${vendor}` : "https://dontkillmyapp.com/";
}

type Health = { location: boolean; background: boolean; notifications: boolean; camera: boolean };

async function readHealth(): Promise<Health> {
  const [fg, bg, notif, camera] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    Notifications.getPermissionsAsync(),
    Camera.getCameraPermissionsAsync(),
  ]);
  return {
    location: fg.granted,
    background: bg.granted,
    notifications: notif.granted,
    camera: camera.granted,
  };
}

export default function SettingsScreen() {
  const theme = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const t = useT();
  const settings = useSettings();

  const [cancelPin, setCancelPin] = useState("");
  const [duressPin, setDuressPin] = useState("");
  const [pinStatus, setPinStatus] = useState<Key | null>(null);

  const [health, setHealth] = useState<Health | null>(null);
  const [queued, setQueued] = useState(0);

  const [signedInPhone, setSignedInPhone] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void readHealth().then(setHealth);
    setQueued(queuedCount());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      void loadPins().then((pins) => {
        setCancelPin(pins.cancelPin);
        setDuressPin(pins.duressPin);
      });
    }, [refresh]),
  );

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setSignedInPhone(data.session?.user.phone ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedInPhone(session?.user.phone ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function saveAllPins() {
    const error = validatePins(cancelPin, duressPin);
    if (error) {
      setPinStatus(PIN_ERROR[error]);
      return;
    }
    await savePins({ cancelPin, duressPin });
    setPinStatus("settings.pinsSaved");
  }

  async function grant(kind: keyof Health) {
    const result =
      kind === "location"
        ? await Location.requestForegroundPermissionsAsync()
        : kind === "background"
          ? await Location.requestBackgroundPermissionsAsync()
          : kind === "camera"
            ? await Camera.requestCameraPermissionsAsync()
            : await Notifications.requestPermissionsAsync();
    // Once permanently denied, only the system settings screen can undo it.
    if (!result.granted && !result.canAskAgain) await Linking.openSettings();
    // Otherwise the token waited for the next sign-in or launch, and this
    // phone could not be alerted as a responder until then.
    if (kind === "notifications" && result.granted) await registerForPush();
    refresh();
  }

  async function requestCode() {
    setAccountError(null);
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setAccountError(t("common.invalidPhone"));
      return;
    }
    const error = await sendOtp(normalized);
    if (error) setAccountError(t("account.error", { msg: error }));
    else setCodeSent(true);
  }

  async function confirmCode() {
    setAccountError(null);
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    const error = await verifyOtp(normalized, code.trim());
    if (error) {
      setAccountError(t("account.error", { msg: error }));
      return;
    }
    setCode("");
    setCodeSent(false);
    void syncProfile(getSettings());
  }

  const brand = Device.manufacturer ?? Device.brand ?? "";
  const rows: { kind: keyof Health; label: Key; why: Key }[] = [
    { kind: "location", label: "health.location", why: "health.locationWhy" },
    { kind: "background", label: "health.background", why: "health.backgroundWhy" },
    { kind: "notifications", label: "health.notifications", why: "health.notificationsWhy" },
    { kind: "camera", label: "health.camera", why: "health.cameraWhy" },
  ];
  const relay = relayStatus();

  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text style={s.heading} accessibilityRole="header">
        {t("settings.language")}
      </Text>
      <View style={s.chips}>
        {locales.map((l) => (
          <Pressable
            key={l}
            onPress={() => updateSettings({ locale: l })}
            style={[s.chip, settings.locale === l && s.chipOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: settings.locale === l }}
          >
            <Text style={[s.chipLabel, settings.locale === l && s.chipLabelOn]}>
              {localeNames[l]}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.heading} accessibilityRole="header">
        {t("settings.appearance")}
      </Text>
      <View style={s.chips}>
        {APPEARANCES.map((a) => (
          <Pressable
            key={a}
            onPress={() => updateSettings({ appearance: a })}
            style={[s.chip, settings.appearance === a && s.chipOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: settings.appearance === a }}
          >
            <Text style={[s.chipLabel, settings.appearance === a && s.chipLabelOn]}>
              {t(`appearance.${a}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={s.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>{t("settings.silent")}</Text>
          <Text style={s.hint}>{t("settings.silentHint")}</Text>
        </View>
        <Switch
          value={settings.silentMode}
          onValueChange={(v) => updateSettings({ silentMode: v })}
          accessibilityLabel={t("settings.silent")}
          trackColor={{ true: theme.brand, false: theme.line }}
        />
      </View>

      <View style={s.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>{t("settings.shake")}</Text>
          <Text style={s.hint}>{t("settings.shakeHint")}</Text>
        </View>
        <Switch
          value={settings.shakeToTrigger}
          onValueChange={(v) => updateSettings({ shakeToTrigger: v })}
          accessibilityLabel={t("settings.shake")}
          trackColor={{ true: theme.brand, false: theme.line }}
        />
      </View>

      <View style={s.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>{t("settings.fall")}</Text>
          <Text style={s.hint}>{t("settings.fallHint")}</Text>
        </View>
        <Switch
          value={settings.fallDetection}
          onValueChange={(v) => updateSettings({ fallDetection: v })}
          accessibilityLabel={t("settings.fall")}
          trackColor={{ true: theme.brand, false: theme.line }}
        />
      </View>

      <View style={s.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>{t("settings.evidence")}</Text>
          <Text style={s.hint}>{t("settings.evidenceHint")}</Text>
        </View>
        <Switch
          value={settings.captureEvidence}
          onValueChange={(v) => updateSettings({ captureEvidence: v })}
          accessibilityLabel={t("settings.evidence")}
          trackColor={{ true: theme.brand, false: theme.line }}
        />
      </View>

      <View style={s.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>{t("settings.relay")}</Text>
          <Text style={s.hint}>{t("settings.relayHint")}</Text>
          <Text style={relay.state === "failed" ? s.warn : s.hint}>
            {t(`relay.${relay.state}` as Key, { msg: relay.failure })}
          </Text>
        </View>
        <Switch
          value={settings.relayForOthers}
          onValueChange={(v) => updateSettings({ relayForOthers: v })}
          accessibilityLabel={t("settings.relay")}
          trackColor={{ true: theme.brand, false: theme.line }}
        />
      </View>

      <Text style={s.heading} accessibilityRole="header">
        {t("settings.countdown")}
      </Text>
      <View style={s.chips}>
        {COUNTDOWNS.map((n) => (
          <Pressable
            key={n}
            onPress={() => updateSettings({ countdownSeconds: n })}
            style={[s.chip, settings.countdownSeconds === n && s.chipOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: settings.countdownSeconds === n }}
          >
            <Text style={[s.chipLabel, settings.countdownSeconds === n && s.chipLabelOn]}>
              {t("settings.seconds", { n })}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.heading} accessibilityRole="header">
        {t("settings.pins")}
      </Text>
      <Text style={s.hint}>{t("settings.pinsHint")}</Text>
      <TextInput
        value={cancelPin}
        onChangeText={(v) => {
          setCancelPin(v);
          setPinStatus(null);
        }}
        placeholder={t("settings.cancelPin")}
        placeholderTextColor={theme.inkFaint}
        accessibilityLabel={t("settings.cancelPin")}
        secureTextEntry
        keyboardType="number-pad"
        maxLength={6}
        style={s.input}
      />
      <TextInput
        value={duressPin}
        onChangeText={(v) => {
          setDuressPin(v);
          setPinStatus(null);
        }}
        placeholder={t("settings.duressPin")}
        placeholderTextColor={theme.inkFaint}
        accessibilityLabel={t("settings.duressPin")}
        secureTextEntry
        keyboardType="number-pad"
        maxLength={6}
        style={s.input}
      />
      <Text style={s.hint}>{t("settings.covertHint")}</Text>
      <Pressable style={s.secondary} onPress={() => void saveAllPins()} accessibilityRole="button">
        <Text style={s.secondaryLabel}>{t("settings.savePins")}</Text>
      </Pressable>
      {pinStatus && (
        <Text
          style={pinStatus === "settings.pinsSaved" ? s.ok : s.warn}
          accessibilityLiveRegion="polite"
        >
          {t(pinStatus)}
        </Text>
      )}

      <Text style={s.heading} accessibilityRole="header">
        {t("settings.health")}
      </Text>
      {rows.map((row) => {
        const on = health?.[row.kind] ?? false;
        return (
          <View key={row.kind} style={s.healthRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>{t(row.label)}</Text>
              <Text style={s.hint}>{t(row.why)}</Text>
            </View>
            {on ? (
              <Text style={s.ok}>✓ {t("health.granted")}</Text>
            ) : (
              <Pressable
                onPress={() => void grant(row.kind)}
                style={s.fix}
                accessibilityRole="button"
                accessibilityLabel={`${t("health.fix")}: ${t(row.label)}`}
              >
                <Text style={s.fixLabel}>{t("health.fix")}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      <View style={s.healthRow}>
        <Text style={[s.label, { flex: 1 }]}>{t("health.queue")}</Text>
        <Text style={queued > 0 ? s.warn : s.ok}>{queued}</Text>
      </View>
      {Platform.OS === "android" && brand !== "" && (
        <View style={s.oem}>
          <Text style={s.hint}>{t("health.oem", { brand })}</Text>
          <Pressable
            onPress={() => void Linking.openURL(oemGuideUrl(brand))}
            style={s.secondary}
            accessibilityRole="link"
          >
            <Text style={s.secondaryLabel}>{t("health.oemOpen")}</Text>
          </Pressable>
        </View>
      )}

      <Text style={s.heading} accessibilityRole="header">
        {t("settings.account")}
      </Text>
      {!supabase ? (
        <Text style={s.hint}>{t("account.unconfigured")}</Text>
      ) : signedInPhone ? (
        <View style={s.healthRow}>
          <Text style={[s.label, { flex: 1 }]}>
            {t("account.signedIn")}: +{signedInPhone.replace(/^\+/, "")}
          </Text>
          <Pressable onPress={() => void signOut()} style={s.fix} accessibilityRole="button">
            <Text style={s.fixLabel}>{t("account.signOut")}</Text>
          </Pressable>
        </View>
      ) : null}
      {supabase && signedInPhone ? (
        <Text style={pushState() === "on" ? s.ok : s.hint}>
          {pushState() === "on" ? t("account.pushOn") : t("account.pushUnavailable")}
        </Text>
      ) : supabase ? (
        <View style={{ gap: 10 }}>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder={t("account.phone")}
            placeholderTextColor={theme.inkFaint}
            accessibilityLabel={t("account.phone")}
            keyboardType="phone-pad"
            autoComplete="tel"
            style={s.input}
          />
          {codeSent && (
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder={t("account.code")}
              placeholderTextColor={theme.inkFaint}
              accessibilityLabel={t("account.code")}
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              style={s.input}
            />
          )}
          <Pressable
            style={s.secondary}
            onPress={() => void (codeSent ? confirmCode() : requestCode())}
            accessibilityRole="button"
          >
            <Text style={s.secondaryLabel}>
              {codeSent ? t("account.verify") : t("account.sendCode")}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {accountError && (
        <Text style={s.warn} accessibilityLiveRegion="polite">
          {accountError}
        </Text>
      )}
    </ScrollView>
  );
}

function makeStyles(theme: Palette) {
  return StyleSheet.create({
    page: { padding: 20, gap: 12, backgroundColor: theme.bg, flexGrow: 1 },
    heading: {
      color: theme.inkFaint,
      fontSize: 13,
      fontWeight: "700",
      textTransform: "uppercase",
      marginTop: 12,
    },
    label: { color: theme.ink, fontSize: 16, fontWeight: "600" },
    hint: { color: theme.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 2 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      borderWidth: 1,
      borderColor: theme.line,
      backgroundColor: theme.surface,
      borderRadius: 999,
      minHeight: 44,
      paddingHorizontal: 16,
      justifyContent: "center",
    },
    chipOn: { borderColor: theme.brand, backgroundColor: "rgba(45,212,191,0.12)" },
    chipLabel: { color: theme.inkMuted, fontSize: 15 },
    chipLabelOn: { color: theme.brand, fontWeight: "700" },
    switchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderColor: theme.line,
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 14,
      marginTop: 8,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.line,
      backgroundColor: theme.surface,
      color: theme.ink,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
    },
    secondary: {
      borderWidth: 1,
      borderColor: theme.line,
      backgroundColor: theme.surface2,
      borderRadius: 12,
      minHeight: 50,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryLabel: { color: theme.ink, fontSize: 16, fontWeight: "600" },
    healthRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderColor: theme.line,
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 14,
    },
    fix: {
      borderWidth: 1,
      borderColor: theme.brand,
      borderRadius: 10,
      minHeight: 44,
      paddingHorizontal: 14,
      justifyContent: "center",
    },
    fixLabel: { color: theme.brand, fontSize: 14, fontWeight: "700" },
    oem: { gap: 10 },
    ok: { color: theme.ok, fontSize: 14, fontWeight: "600" },
    warn: { color: theme.warn, fontSize: 14, fontWeight: "600" },
  });
}
