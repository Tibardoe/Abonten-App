import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Event reminders = real OS-scheduled local notifications (expo-notifications
// date triggers), NOT an in-app timer. They survive the app being killed and
// a device reboot (expo-notifications re-arms scheduled notifications on
// BOOT_COMPLETED on Android; iOS holds them in the OS).
//
// The user's choice per event is persisted in expo-secure-store — one small
// JSON record per event plus an index — so it can be reconciled later:
// whenever the event's detail is (re)loaded we compare the stored start time
// with the fresh one and re-arm on a change, and drop everything if the
// event is cancelled or gone.
//
// LIMITATION: this is device-local. There is no reminders table in the
// backend, so a reminder set on one device is not mirrored to the user's
// other devices. Adding that would need a new table + an /api/mobile route;
// out of scope here and flagged in the Phase-2 notes.

export const ANDROID_CHANNEL_ID = "event-reminders";

export const REMINDER_OFFSETS: { minutes: number; label: string }[] = [
  { minutes: 10, label: "10 minutes before" },
  { minutes: 30, label: "30 minutes before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 1440, label: "1 day before" },
];

export type EventReminderRecord = {
  eventId: string;
  eventTitle: string;
  startsAtIso: string;
  offsets: number[]; // minutes-before, subset of REMINDER_OFFSETS
  notificationIds: string[];
};

const recordKey = (eventId: string) =>
  `evtreminder.${eventId.replace(/[^A-Za-z0-9._-]/g, "")}`;
const INDEX_KEY = "evtreminder.index";

async function readIndex(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(INDEX_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

async function writeIndex(ids: string[]): Promise<void> {
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify([...new Set(ids)]));
}

export async function getEventReminder(
  eventId: string,
): Promise<EventReminderRecord | null> {
  try {
    const raw = await SecureStore.getItemAsync(recordKey(eventId));
    return raw ? (JSON.parse(raw) as EventReminderRecord) : null;
  } catch {
    return null;
  }
}

/** Ask for notification permission and (Android) make the channel. */
export async function ensureReminderPermission(): Promise<boolean> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return false;

  const settings = await Notifications.getPermissionsAsync();
  let granted = settings.granted;
  if (!granted && settings.canAskAgain) {
    const req = await Notifications.requestPermissionsAsync();
    granted = req.granted;
  }
  if (!granted) return false;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: "Event reminders",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  return true;
}

async function cancelIds(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => {}),
    ),
  );
}

function offsetLabel(minutes: number): string {
  return (
    REMINDER_OFFSETS.find((o) => o.minutes === minutes)?.label ??
    `${minutes} minutes before`
  );
}

/**
 * Set (or replace) the reminders for one event. Cancels any it already had,
 * then schedules one local notification per chosen offset whose fire time is
 * still in the future. Pass `offsets: []` to clear.
 */
export async function setEventReminders(input: {
  eventId: string;
  eventTitle: string;
  startsAtIso: string;
  offsets: number[];
}): Promise<EventReminderRecord | null> {
  const existing = await getEventReminder(input.eventId);
  if (existing) await cancelIds(existing.notificationIds);

  if (input.offsets.length === 0) {
    await clearEventReminders(input.eventId);
    return null;
  }

  const startMs = new Date(input.startsAtIso).getTime();
  const notificationIds: string[] = [];
  const keptOffsets: number[] = [];

  for (const minutes of input.offsets) {
    const fireAt = new Date(startMs - minutes * 60_000);
    if (fireAt.getTime() <= Date.now() + 5_000) continue; // too soon / past

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Upcoming event",
        body: `${input.eventTitle} starts ${offsetLabel(minutes).replace(
          " before",
          "",
        )} from now.`,
        data: { link: `/(app)/event/${input.eventId}` },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
        ...(Platform.OS === "android" ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
    });
    notificationIds.push(id);
    keptOffsets.push(minutes);
  }

  const record: EventReminderRecord = {
    eventId: input.eventId,
    eventTitle: input.eventTitle,
    startsAtIso: input.startsAtIso,
    offsets: keptOffsets,
    notificationIds,
  };

  if (keptOffsets.length === 0) {
    await clearEventReminders(input.eventId);
    return null;
  }

  await SecureStore.setItemAsync(
    recordKey(input.eventId),
    JSON.stringify(record),
  );
  const index = await readIndex();
  if (!index.includes(input.eventId)) {
    await writeIndex([...index, input.eventId]);
  }
  return record;
}

/** Cancel every scheduled reminder for an event and forget it. */
export async function clearEventReminders(eventId: string): Promise<void> {
  const existing = await getEventReminder(eventId);
  if (existing) await cancelIds(existing.notificationIds);
  await SecureStore.deleteItemAsync(recordKey(eventId)).catch(() => {});
  const index = await readIndex();
  if (index.includes(eventId)) {
    await writeIndex(index.filter((id) => id !== eventId));
  }
}

/**
 * Bring an event's reminders back in line with its current state. Call this
 * whenever fresh event data is available. Removes everything if the event is
 * cancelled or deleted; re-arms with the same offsets if the start time
 * moved.
 */
export async function reconcileEventReminder(input: {
  eventId: string;
  startsAtIso: string | null;
  status?: string | null;
  deleted?: boolean;
}): Promise<void> {
  const record = await getEventReminder(input.eventId);
  if (!record) return;

  if (input.deleted || input.status === "canceled" || !input.startsAtIso) {
    await clearEventReminders(input.eventId);
    return;
  }

  if (input.startsAtIso !== record.startsAtIso) {
    await setEventReminders({
      eventId: input.eventId,
      eventTitle: record.eventTitle,
      startsAtIso: input.startsAtIso,
      offsets: record.offsets,
    });
  }
}

export async function listEventReminders(): Promise<EventReminderRecord[]> {
  const index = await readIndex();
  const out: EventReminderRecord[] = [];
  for (const id of index) {
    const rec = await getEventReminder(id);
    if (rec) out.push(rec);
  }
  return out;
}
