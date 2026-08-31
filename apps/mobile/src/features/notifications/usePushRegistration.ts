import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";

// Foreground notifications still show a banner + play a sound.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function resolveProjectId(): string | undefined {
  const id = Constants.expoConfig?.extra?.eas?.projectId;
  return typeof id === "string" ? id : undefined;
}

/**
 * Registers this device's Expo push token with the backend while signed in,
 * and routes a tapped notification to its `link` deep link. Mounted once
 * from the authenticated layout. A no-op on web and — until an EAS project
 * id exists (Phase 6) — when `getExpoPushTokenAsync` has no project to
 * scope the token to; it logs and moves on rather than throwing.
 */
export function usePushRegistration() {
  const { session } = useSession();
  const router = useRouter();

  // Register the token whenever we have a session and a native platform.
  useEffect(() => {
    if (!session) return;
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;

    let cancelled = false;

    (async () => {
      try {
        const settings = await Notifications.getPermissionsAsync();
        let granted = settings.granted;
        if (!granted && settings.canAskAgain) {
          const req = await Notifications.requestPermissionsAsync();
          granted = req.granted;
        }
        if (!granted || cancelled) return;

        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "Default",
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        // No EAS project id yet (set up in Phase 6) — nothing to scope a
        // push token to, so stop here rather than throw.
        const projectId = resolveProjectId();
        if (!projectId) return;

        const { data: token } = await Notifications.getExpoPushTokenAsync({
          projectId,
        });
        if (cancelled || !token) return;

        await api.devices.register({
          token,
          platform: Platform.OS === "ios" ? "ios" : "android",
        });
      } catch {
        // Push is a best-effort enhancement; never disrupt the app if the
        // permission prompt, token fetch, or register call fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

  // Route a tapped notification to its link.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const link = response.notification.request.content.data?.link;
        if (typeof link === "string" && link.length > 0) {
          router.push(link as never);
        }
      },
    );
    return () => sub.remove();
  }, [router]);
}

/** Best-effort: drop this device's token before signing out. */
export async function unregisterPushToken(): Promise<void> {
  try {
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;
    const projectId = resolveProjectId();
    if (!projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    if (token) await api.devices.unregister(token);
  } catch {
    // Sign-out must not be blocked by a failed unregister; a stale token is
    // pruned server-side on the next DeviceNotRegistered push receipt.
  }
}
