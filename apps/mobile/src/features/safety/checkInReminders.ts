import { CHECK_IN_REMINDER_LEAD_MS } from "@abonten/core/safety/rules";
import { translatorFor } from "@abonten/ui-native/i18n";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// "Check in on me" reminders as real OS-scheduled notifications: one five
// minutes before the time and one at the time. They fire with no
// connection and with the app closed, which a server push cannot promise.
// The server still pushes at the time and alerts the contacts after the
// grace; these only make sure the person is asked first.

export const SAFETY_CHANNEL_ID = "safety";

const key = (sessionId: string) =>
  `abonten.safety.reminders.${sessionId.replace(/[^A-Za-z0-9._-]/g, "")}`;

async function ensurePermission(): Promise<boolean> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return false;
  try {
    const settings = await Notifications.getPermissionsAsync();
    let granted = settings.granted;
    if (!granted && settings.canAskAgain) {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (!granted) return false;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(SAFETY_CHANNEL_ID, {
        name: translatorFor("safety")("channelName"),
        importance: Notifications.AndroidImportance.MAX,
      });
    }
    return true;
  } catch {
    return false;
  }
}

export async function cancelCheckInReminders(sessionId: string): Promise<void> {
  try {
    const raw = await SecureStore.getItemAsync(key(sessionId));
    const ids = raw ? (JSON.parse(raw) as string[]) : [];
    await Promise.all(
      ids.map((id) =>
        Notifications.cancelScheduledNotificationAsync(id).catch(() => {}),
      ),
    );
    await SecureStore.deleteItemAsync(key(sessionId));
  } catch {
    // nothing scheduled
  }
}

/** Replaces this check-in's reminders with ones for `dueAtIso`. */
export async function scheduleCheckInReminders(
  sessionId: string,
  dueAtIso: string,
): Promise<void> {
  await cancelCheckInReminders(sessionId);
  if (!(await ensurePermission())) return;
  const t = translatorFor("safety");
  const due = Date.parse(dueAtIso);
  const fires = [
    {
      at: due - CHECK_IN_REMINDER_LEAD_MS,
      title: t("reminder.soonTitle"),
      body: t("reminder.soonBody"),
    },
    { at: due, title: t("reminder.nowTitle"), body: t("reminder.nowBody") },
  ].filter((f) => f.at > Date.now() + 5_000);
  const ids: string[] = [];
  for (const fire of fires) {
    try {
      ids.push(
        await Notifications.scheduleNotificationAsync({
          content: {
            title: fire.title,
            body: fire.body,
            // Routed like the server's own Safety notices (notificationLink).
            data: { kind: "safety", safetyRole: "person", sessionId },
            sound: "default",
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(fire.at),
            ...(Platform.OS === "android"
              ? { channelId: SAFETY_CHANNEL_ID }
              : {}),
          },
        }),
      );
    } catch {
      // A reminder that cannot be scheduled leaves the server's push.
    }
  }
  try {
    await SecureStore.setItemAsync(key(sessionId), JSON.stringify(ids));
  } catch {
    // best effort
  }
}
