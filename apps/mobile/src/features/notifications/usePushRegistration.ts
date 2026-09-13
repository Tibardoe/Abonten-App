import { useSession } from "@/auth/SessionProvider";
import { getActiveConversation } from "@/features/messaging/activeConversation";
import { notificationTarget } from "@/features/notifications/notificationLink";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { NotificationData } from "@abonten/types/notificationType";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";

// Foreground notifications still show a banner + play a sound — except a
// message for the conversation that's already on screen: the realtime layer
// has already dropped it into the thread, so a banner + ping would just be
// noise (spec §7, foreground suppression).
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as
      | (NotificationData & Record<string, unknown>)
      | undefined;
    const suppress =
      data?.kind === "message" &&
      typeof data.conversationId === "string" &&
      data.conversationId === getActiveConversation();

    return {
      shouldShowBanner: !suppress,
      shouldShowList: !suppress,
      shouldPlaySound: !suppress,
      shouldSetBadge: false,
    };
  },
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

  // Route a tapped push notification. The push payload carries the same
  // `link` + structured `data` (kind + entity ids) the in-app list uses, so
  // routing goes through the identical notificationTarget translation —
  // never the raw web path.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const payload = response.notification.request.content.data as
          | (NotificationData & {
              link?: string | null;
              notificationId?: string;
            })
          | undefined;
        // Opening a push is reading it (and, for a recommendation digest,
        // what counts as opened). Best-effort.
        if (payload?.notificationId) {
          api.notifications
            .markRead(payload.notificationId)
            .then(() =>
              queryClient.invalidateQueries({
                queryKey: ["mobile", "notifications"],
              }),
            )
            .catch(() => {});
        }
        const href = notificationTarget({
          link: payload?.link ?? null,
          data: payload ?? null,
        });
        if (href) router.push(href);
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
