import { useCallback, useEffect, useState } from "react";
import {
  type EventReminderRecord,
  ensureReminderPermission,
  getEventReminder,
  reconcileEventReminder,
  setEventReminders,
} from "./eventReminders";

export type SaveReminderResult =
  | { ok: true }
  | { ok: false; reason: "permission" | "no-event" };

// Reads the stored reminder offsets for one event and saves changes through
// the eventReminders module (which does the OS scheduling). On mount, and
// whenever fresh event data comes in, it also reconciles the schedule
// against the event's current start time / status.
export function useEventReminder(
  eventId: string | undefined,
  liveStartsAtIso?: string | null,
  liveStatus?: string | null,
) {
  const [offsets, setOffsets] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    getEventReminder(eventId).then((rec: EventReminderRecord | null) => {
      if (cancelled) return;
      setOffsets(rec?.offsets ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  // Keep the OS schedule in step with the live event.
  useEffect(() => {
    if (!eventId || liveStartsAtIso === undefined) return;
    reconcileEventReminder({
      eventId,
      startsAtIso: liveStartsAtIso,
      status: liveStatus,
    }).then(() =>
      getEventReminder(eventId).then((r) => setOffsets(r?.offsets ?? [])),
    );
  }, [eventId, liveStartsAtIso, liveStatus]);

  const save = useCallback(
    async (
      next: number[],
      meta: { eventTitle: string; startsAtIso: string },
    ): Promise<SaveReminderResult> => {
      if (!eventId) return { ok: false, reason: "no-event" };
      if (next.length > 0) {
        const granted = await ensureReminderPermission();
        if (!granted) return { ok: false, reason: "permission" };
      }
      setSaving(true);
      try {
        await setEventReminders({
          eventId,
          eventTitle: meta.eventTitle,
          startsAtIso: meta.startsAtIso,
          offsets: next,
        });
        const rec = await getEventReminder(eventId);
        setOffsets(rec?.offsets ?? []);
        return { ok: true };
      } finally {
        setSaving(false);
      }
    },
    [eventId],
  );

  return { offsets, loading, saving, save, enabled: offsets.length > 0 };
}
