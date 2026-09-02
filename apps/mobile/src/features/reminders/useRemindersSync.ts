import { useSession } from "@/auth/SessionProvider";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import {
  clearEventReminders,
  listEventReminders,
  markLocalServerSynced,
  sameOffsets,
  setEventReminders,
} from "./eventReminders";
import { pullServerReminders, pushServerReminder } from "./reminderSync";

// App-wide reconcile between the device's scheduled reminders and the
// `event_reminder` rows — runs on sign-in and on every return to the
// foreground. This is what proactively clears a reminder whose event was
// deleted (FK cascade removed the row) or that was turned off on another
// device, without needing the user to open that event's detail screen.
async function syncAll(userId: string): Promise<void> {
  const local = await listEventReminders();
  if (local.length === 0) return;

  const server = await pullServerReminders(local.map((r) => r.eventId)).catch(
    () => null,
  );
  if (!server) return;

  for (const rec of local) {
    const remote = server.get(rec.eventId);

    if (remote === undefined) {
      // No server row.
      if (rec.serverSynced) {
        await clearEventReminders(rec.eventId);
      } else {
        await pushServerReminder(userId, rec.eventId, rec.offsets)
          .then(() => markLocalServerSynced(rec.eventId, true))
          .catch(() => {});
      }
    } else if (!sameOffsets(rec.offsets, remote)) {
      await setEventReminders({
        eventId: rec.eventId,
        eventTitle: rec.eventTitle,
        startsAtIso: rec.startsAtIso,
        offsets: remote,
        serverSynced: true,
      });
    } else if (!rec.serverSynced) {
      await markLocalServerSynced(rec.eventId, true);
    }
  }
}

export function useRemindersSync() {
  const { session } = useSession();
  const userId = session?.user.id;
  const runningRef = useRef(false);

  useEffect(() => {
    if (!userId) return;

    const run = () => {
      if (runningRef.current) return;
      runningRef.current = true;
      syncAll(userId).finally(() => {
        runningRef.current = false;
      });
    };

    run();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") run();
    });
    return () => sub.remove();
  }, [userId]);
}
