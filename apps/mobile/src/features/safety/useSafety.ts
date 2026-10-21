import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import { settleEnvelope } from "@/lib/envelope";
import { uuidv4 } from "@/lib/uuid";
import type {
  SafetyLocationBody,
  StartSafetySessionBody,
} from "@abonten/api-client";
import {
  DISABLED_SAFETY_PROGRAM,
  type SafetyOverview,
  type SafetyProgram,
  type SafetySession,
} from "@abonten/types/safetyType";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  cancelCheckInReminders,
  scheduleCheckInReminders,
} from "./checkInReminders";
import { deviceSosText, openDeviceSms } from "./deviceSms";
import { quickSafetyFix } from "./safetyLocation";
import {
  clearPendingSos,
  readSafetySnapshot,
  savePendingSos,
  saveSafetySnapshot,
} from "./safetyStore";

// Abonten Safety for the app. Everything goes through /api/mobile/safety
// (the tables are service-role only). Keys include the signed-in user, so
// one account never sees another's contacts from cache.

export const SAFETY_KEY = ["mobile", "safety"] as const;

export function useSafetyProgram() {
  const { session } = useSession();
  const query = useQuery({
    queryKey: [...SAFETY_KEY, "program", session?.user.id ?? null],
    enabled: !!session,
    queryFn: async (): Promise<SafetyProgram> => {
      const res = await api.safety.program();
      // A hiccup must not replace a known answer with "switched off".
      if (res.status >= 500 || res.status === 429 || res.status === 401) {
        throw new Error(res.message ?? "Programme check failed");
      }
      return res.status === 200 && res.data
        ? res.data
        : DISABLED_SAFETY_PROGRAM;
    },
    staleTime: 5 * 60 * 1000,
  });
  return { ...query, program: query.data ?? DISABLED_SAFETY_PROGRAM };
}

export function safetyOverviewKey(userId: string | null | undefined) {
  return [...SAFETY_KEY, "overview", userId ?? null] as const;
}

export function useSafetyOverview(options: { enabled?: boolean } = {}) {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  return useQuery({
    queryKey: safetyOverviewKey(userId),
    enabled: !!userId && options.enabled !== false,
    queryFn: async () => {
      const res = settleEnvelope(await api.safety.overview());
      if (res.status === 200 && res.data && userId) {
        void saveSafetySnapshot(userId, res.data);
      }
      return res;
    },
    staleTime: 30_000,
  });
}

/** Writes a session the server just returned into the cached overview. */
export function useApplySafetySession() {
  const qc = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  return useCallback(
    (next: SafetySession) => {
      qc.setQueryData(
        safetyOverviewKey(userId),
        (prev: { status: number; data?: SafetyOverview } | undefined) => {
          if (!prev?.data) return prev;
          const open = next.status === "active" || next.status === "alerting";
          return {
            ...prev,
            data: { ...prev.data, active: open ? next : null },
          };
        },
      );
      if (next.kind === "check_in" && next.status === "active" && next.dueAt) {
        void scheduleCheckInReminders(next.id, next.dueAt);
      } else {
        void cancelCheckInReminders(next.id);
      }
      void qc.invalidateQueries({ queryKey: safetyOverviewKey(userId) });
    },
    [qc, userId],
  );
}

export type StartOutcome =
  | { kind: "started"; session: SafetySession; escalated: boolean }
  | { kind: "refused"; message: string }
  /** The server could not be reached: the phone's Messages app was opened. */
  | { kind: "offline"; openedMessages: boolean };

/**
 * Starts SOS, a check-in or a share. For SOS, when Abonten cannot be reached
 * (or refuses), the phone's Messages app opens to the cached contacts with
 * the person's position, and the alert is kept to be sent again with the
 * same request id once the connection is back.
 */
export function useStartSafety() {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const apply = useApplySafetySession();
  return useCallback(
    async (
      body: Omit<StartSafetySessionBody, "clientRequestId" | "location"> & {
        location?: SafetyLocationBody | null;
      },
    ): Promise<StartOutcome> => {
      const clientRequestId = uuidv4();
      const location =
        body.location !== undefined ? body.location : await quickSafetyFix();
      const request = {
        ...body,
        clientRequestId,
        location,
      } as StartSafetySessionBody;
      const isSos = body.kind === "sos";
      if (isSos && userId) {
        await savePendingSos(userId, {
          clientRequestId,
          startedAt: Date.now(),
          location: location ?? null,
          eventId: body.eventId ?? null,
          note: body.note,
        });
      }
      const fallBack = async (): Promise<StartOutcome> => {
        const snapshot = userId ? await readSafetySnapshot(userId) : null;
        const opened = await openDeviceSms(
          (snapshot?.contacts ?? []).map((c) => c.phoneE164),
          deviceSosText(location ?? null),
        );
        return { kind: "offline", openedMessages: opened };
      };
      let res: Awaited<ReturnType<typeof api.safety.start>>;
      try {
        res = await api.safety.start(request);
      } catch {
        if (isSos) return fallBack();
        throw new Error("network");
      }
      if ((res.status === 200 || res.status === 201) && res.data) {
        if (userId) await clearPendingSos(userId);
        apply(res.data.session);
        return {
          kind: "started",
          session: res.data.session,
          escalated: res.data.escalated,
        };
      }
      if (isSos) {
        // Not sent by Abonten (switched off, no contacts, a server error):
        // the person's own phone still can.
        if (userId && res.status < 500) await clearPendingSos(userId);
        return fallBack();
      }
      return { kind: "refused", message: res.message ?? "" };
    },
    [apply, userId],
  );
}

/** Sends again an SOS the server never confirmed (same request id). */
export async function retryPendingSos(
  userId: string,
  pending: {
    clientRequestId: string;
    location: SafetyLocationBody | null;
    eventId: string | null;
    note?: string;
  },
): Promise<SafetySession | null> {
  try {
    const res = await api.safety.start({
      kind: "sos",
      clientRequestId: pending.clientRequestId,
      location: pending.location,
      eventId: pending.eventId,
      note: pending.note,
    });
    if ((res.status === 200 || res.status === 201) && res.data) {
      await clearPendingSos(userId);
      return res.data.session;
    }
    if (res.status < 500 && res.status !== 429 && res.status !== 401) {
      await clearPendingSos(userId);
    }
  } catch {
    // still offline: kept for the next try
  }
  return null;
}
