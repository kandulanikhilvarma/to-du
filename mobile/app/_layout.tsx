import { useEffect } from "react";
import * as Network from "expo-network";
import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { TorchHost } from "../components/torch-host";
import {
  ensureRelayIdentity,
  hasBackend,
  sendQueued,
  supabase,
  syncEmergencyContacts,
} from "../lib/backend";
import { retryServerCheckIn } from "../lib/checkin";
import { useT } from "../lib/i18n";
import { ensureSosChannel, registerForPush } from "../lib/push";
import { flush } from "../lib/queue";
import { startRelay } from "../lib/relay";
import { getSettings } from "../lib/settings";
import { useTheme } from "../lib/theme";

// Show SOS alerts even while Todu is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Anything recorded offline goes out the moment a connection returns. */
function useQueueFlusher() {
  useEffect(() => {
    if (!hasBackend()) return;
    const drain = () => {
      void flush(sendQueued);
      void retryServerCheckIn();
    };
    drain();
    const sub = Network.addNetworkStateListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) drain();
    });
    return () => sub.remove();
  }, []);
}

/** Work that needs a signed-in session: the relay signing key (fetched while
 *  online so an offline SOS can still be signed), contacts for server SMS,
 *  and the push token that lets this phone be alerted as a responder. */
function useSessionSetup() {
  useEffect(() => {
    if (!supabase) return;
    const setUp = () => {
      void ensureRelayIdentity();
      void syncEmergencyContacts(getSettings().contacts);
      void registerForPush();
    };
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) setUp();
    });
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") setUp();
    });
    return () => data.subscription.unsubscribe();
  }, []);
}

export default function RootLayout() {
  const t = useT();
  const theme = useTheme();
  useQueueFlusher();
  useSessionSetup();

  useEffect(() => {
    void ensureSosChannel();
    // Bridgefy validates its licence online the first time; starting at
    // launch means the mesh is ready before an emergency takes the signal.
    void startRelay();
  }, []);

  return (
    <>
      <StatusBar style={theme.scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: theme.ink,
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: t("nav.home") }} />
        <Stack.Screen name="circle" options={{ title: t("nav.circle") }} />
        <Stack.Screen name="profile" options={{ title: t("nav.profile") }} />
        <Stack.Screen name="settings" options={{ title: t("nav.settings") }} />
        <Stack.Screen name="checkin" options={{ title: t("nav.checkin") }} />
        <Stack.Screen name="fakecall" options={{ title: t("nav.fakecall") }} />
      </Stack>
      <TorchHost />
    </>
  );
}
