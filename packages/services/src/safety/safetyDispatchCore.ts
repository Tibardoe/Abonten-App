import { logger } from "@abonten/core/logger";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  type SafetyDeps,
  type SendSummary,
  notifyPerson,
  sendSafetyMessages,
} from "./safetyNotifyCore";
import { readSafetySettings, safetyLimits } from "./safetyProgram";
import { alertMissedCheckIn } from "./safetySessionCore";

// What the safety-dispatch job asks for once a minute while something is
// due (run_safety_dispatch posts to /api/safety/dispatch): missed check-ins
// become alerts, check-ins whose time has come get one "time to check in"
// push, and outbox rows due a (re)try are sent. Escalation runs first so a
// check-in can never be reminded after its contacts were already told.

export type SafetyDispatchResult = SendSummary & {
  escalated: number;
  reminded: number;
};

export async function runSafetyDispatchCore(
  svc: ServiceRoleClient,
  deps: SafetyDeps,
): Promise<{ status: 200 | 500; data?: SafetyDispatchResult }> {
  const result: SafetyDispatchResult = {
    escalated: 0,
    reminded: 0,
    sent: 0,
    failed: 0,
    retrying: 0,
    skipped: 0,
  };
  try {
    const { data: escalated, error: escalateError } = await svc.rpc(
      "safety_escalate_due_check_ins",
    );
    if (escalateError) throw new Error(escalateError.message);
    for (const sessionId of (escalated ?? []) as string[]) {
      result.escalated += 1;
      try {
        await alertMissedCheckIn(svc, sessionId, deps);
        const { data: row } = await svc
          .from("safety_session")
          .select("user_id")
          .eq("id", sessionId)
          .maybeSingle();
        if (row) {
          await notifyPerson(
            svc,
            row.user_id,
            { id: "safety_check_in_escalated" },
            { sessionId, urgent: true },
          );
        }
      } catch (error) {
        // The outbox rows that were written are retried by the next run.
        logger.error(
          `safety dispatch: escalating ${sessionId} failed: ${error}`,
        );
      }
    }

    const { data: due, error: remindError } = await svc.rpc(
      "safety_claim_check_in_reminders",
    );
    if (remindError) throw new Error(remindError.message);
    const dueIds = (due ?? []) as string[];
    if (dueIds.length > 0) {
      const grace = safetyLimits(
        await readSafetySettings(svc),
      ).check_in_grace_minutes;
      const { data: rows } = await svc
        .from("safety_session")
        .select("id, user_id, kind")
        .in("id", dueIds);
      for (const row of rows ?? []) {
        result.reminded += 1;
        await notifyPerson(
          svc,
          row.user_id,
          { id: "safety_check_in_due", params: { minutes: grace } },
          { sessionId: row.id, urgent: true },
        );
        await svc
          .from("safety_session_event")
          .insert({ session_id: row.id, kind: "reminded" });
      }
    }

    const sent = await sendSafetyMessages(svc, { limit: 200 }, deps);
    result.sent = sent.sent;
    result.failed = sent.failed;
    result.retrying = sent.retrying;
    result.skipped = sent.skipped;
    return { status: 200, data: result };
  } catch (error) {
    logger.error(`runSafetyDispatchCore: ${error}`);
    return { status: 500, data: result };
  }
}
