import { useSession } from "@/auth/SessionProvider";
import { useCallback, useEffect, useState } from "react";
import {
  clearEventReminders,
  ensureReminderPermission,
  getEventReminder,
  markLocalServerSynced,
  sameOffsets,
  setEventReminders,
} from "./eventReminders";
import {
  deleteServerReminder,
  pullServerReminder,
  pushServerReminder,
} from "./reminderSync";

export type SaveReminderResult =
  | { ok: true }
  | { ok: false; reason: "permission" | "no-event" };

// Reads the stored reminder offsets for one event, keeps them in step with
// the `event_reminder` row (cross-device), and with the live event
// (start-time change / cancellation). Local OS scheduling is the firing
// mechanism; the server row is the source of truth for *which* offsets.
export function useEventReminder(
  eventId: string | undefined,
  liveStartsAtIso?: string | null,
  liveStatus?: string | null,
  liveTitle?: string,
) {
  const { session } = useSession();
  const userId = session?.user.id;
  const [offsets, setOffsets] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    getEventReminder(eventId).then((rec) => {
      if (cancelled) return;
      setOffsets(rec?.offsets ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  // Reconcile: server row + live event vs the local schedule. Runs once the
  // event's live start time is known.
  useEffect(() => {
    if (!eventId || liveStartsAtIso === undefined) return;
    let cancelled = false;

    (async () => {
      // Cancelled or deleted-from-under-us → drop local + server row.
      if (liveStatus === "canceled" || liveStartsAtIso === null) {
        await clearEventReminders(eventId);
        if (userId) await deleteServerReminder(eventId).catch(() => {});
        if (!cancelled) setOffsets([]);
        return;
      }

      const local = await getEventReminder(eventId);
      const server = userId
        ? await pullServerReminder(eventId).catch(() => undefined)
        : undefined;
      const title = local?.eventTitle ?? liveTitle ?? "Your event";

      // server === undefined → not signed in or the pull failed: fall back
      // to the local-only reconcile (time change).
      if (server === undefined) {
        if (local && liveStartsAtIso !== local.startsAtIso) {
          await setEventReminders({
            eventId,
            eventTitle: title,
            startsAtIso: liveStartsAtIso,
            offsets: local.offsets,
            serverSynced: local.serverSynced,
          });
        }
        if (!cancelled) {
          const r = await getEventReminder(eventId);
          setOffsets(r?.offsets ?? []);
        }
        return;
      }

      if (server === null) {
        // No server row. Clear local only if we KNOW it was synced and is
        // now gone (removed on another device, or the event was deleted →
        // FK cascade). An un-synced local record means our push failed —
        // retry it instead of nuking the user's choice.
        if (local?.serverSynced) {
          await clearEventReminders(eventId);
        } else if (local && userId) {
          await pushServerReminder(userId, eventId, local.offsets)
            .then(() => markLocalServerSynced(eventId, true))
            .catch(() => {});
          if (liveStartsAtIso !== local.startsAtIso) {
            await setEventReminders({
              eventId,
              eventTitle: title,
              startsAtIso: liveStartsAtIso,
              offsets: local.offsets,
              serverSynced: true,
            });
          }
        }
      } else {
        // Server has a choice. Make the local schedule match it (covers a
        // reminder set on another device, and a start-time change).
        const needsReschedule =
          !local ||
          !sameOffsets(local.offsets, server) ||
          liveStartsAtIso !== local.startsAtIso;
        if (needsReschedule) {
          await setEventReminders({
            eventId,
            eventTitle: title,
            startsAtIso: liveStartsAtIso,
            offsets: server,
            serverSynced: true,
          });
        }
      }

      if (!cancelled) {
        const r = await getEventReminder(eventId);
        setOffsets(r?.offsets ?? []);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [eventId, liveStartsAtIso, liveStatus, liveTitle, userId]);

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
        let serverOk = false;
        if (userId) {
          if (next.length === 0) {
            await deleteServerReminder(eventId)
              .then(() => {
                serverOk = true;
              })
              .catch(() => {});
          } else {
            await pushServerReminder(userId, eventId, next)
              .then(() => {
                serverOk = true;
              })
              .catch(() => {});
          }
        }

        await setEventReminders({
          eventId,
          eventTitle: meta.eventTitle,
          startsAtIso: meta.startsAtIso,
          offsets: next,
          serverSynced: serverOk,
        });

        const rec = await getEventReminder(eventId);
        setOffsets(rec?.offsets ?? []);
        return { ok: true };
      } finally {
        setSaving(false);
      }
    },
    [eventId, userId],
  );

  return { offsets, loading, saving, save, enabled: offsets.length > 0 };
}
