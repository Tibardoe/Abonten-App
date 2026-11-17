// "Your payment didn't go through": told to a buyer whose ticket payment
// failed after they had left the payment screen.
//
// A buyer still on the screen sees a decline there (the app and website
// keep checking while it is open). One who closed it on "Still confirming"
// learned nothing: the reconcile sweep (35 minutes on) or a late provider
// event marked the payment failed, the held tickets went back on sale, and
// only the order history said so (found during the live cutover,
// 2026-11-17). Callers decide when the buyer has left; this decides whether
// a notice is still right and sends it at most once per payment.

import { logger } from "@abonten/core/logger";
import { fromMajor } from "@abonten/core/money/money";
import { createNotificationCore } from "../notifications/createNotification";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

/** A decline the provider reports sooner than this the buyer saw on screen. */
export const FAILED_NOTICE_AFTER_MINUTES = 3;

type AttemptRow = {
  id: string;
  user_id: string;
  status: string;
  amount: number | string;
  currency: string;
  metadata: Record<string, unknown> | null;
  checkout_session_id: string | null;
  payment_group_id: string | null;
  created_at: string;
};

const ATTEMPT_COLUMNS =
  "id, user_id, status, amount, currency, metadata, checkout_session_id, payment_group_id, created_at";

/**
 * Sends the notice for a ticket payment that is now `failed`, unless it was
 * sent already, the payment was not for tickets, or the buyer has since got
 * tickets for the same event(s) another way. Never throws.
 */
export async function notifyPaymentDidNotGoThrough(
  attemptId: string,
): Promise<"sent" | "skipped"> {
  try {
    return await send(attemptId);
  } catch (error) {
    logger.error(
      `paymentFailedNotice: ${attemptId} failed (${error instanceof Error ? error.message : String(error)})`,
    );
    return "skipped";
  }
}

async function send(attemptId: string): Promise<"sent" | "skipped"> {
  const service = getSupabaseServiceClient();
  const { data: attempt, error } = await service
    .from("payment_attempt")
    .select(ATTEMPT_COLUMNS)
    .eq("id", attemptId)
    .maybeSingle<AttemptRow>();
  if (error) throw new Error(error.message);
  if (!attempt || attempt.status !== "failed") return "skipped";
  if (!attempt.checkout_session_id) return "skipped";
  if (attempt.metadata?.failure_notified_at) return "skipped";

  // The whole order: a basket payment covers every session of its group.
  // What the buyer was asked to pay: the charge the server opened (on the
  // primary attempt), else the order's amounts in the currency's units.
  const charged = attempt.metadata?.charge_minor;
  let sessionIds = [attempt.checkout_session_id];
  let amounts: (number | string)[] = [attempt.amount];
  if (attempt.payment_group_id) {
    const { data: members, error: membersError } = await service
      .from("payment_attempt")
      .select("checkout_session_id, amount")
      .eq("payment_group_id", attempt.payment_group_id);
    if (membersError) throw new Error(membersError.message);
    sessionIds = [
      ...new Set(
        (members ?? [])
          .map((m) => m.checkout_session_id)
          .filter((x): x is string => !!x),
      ),
    ];
    amounts = (members ?? []).map((m) => m.amount);
  }
  const amountMinor =
    typeof charged === "number"
      ? charged
      : amounts.reduce<number>(
          (sum, a) => sum + fromMajor(a, attempt.currency).amountMinor,
          0,
        );

  const { data: lines, error: linesError } = await service
    .from("ticket_checkout")
    .select("event_id, event:event_id(title, event_code)")
    .in("checkout_session_id", sessionIds);
  if (linesError) throw new Error(linesError.message);
  const events = new Map<string, { title: string; code: string }>();
  for (const line of (lines ?? []) as unknown as {
    event_id: string;
    event: { title: string | null; event_code: string | null } | null;
  }[]) {
    if (line.event?.title && line.event.event_code) {
      events.set(line.event_id, {
        title: line.event.title,
        code: line.event.event_code,
      });
    }
  }
  if (events.size === 0) return "skipped";

  // Paid another way since (a new order for the same event): nothing to say.
  const { data: later, error: laterError } = await service
    .from("ticket")
    .select("ticket_type:ticket_type_id!inner(event_id)")
    .eq("user_id", attempt.user_id)
    .in("status", ["active", "used"])
    .gt("created_at", attempt.created_at)
    .in("ticket_type.event_id", [...events.keys()]);
  if (laterError) throw new Error(laterError.message);
  const covered = new Set(
    ((later ?? []) as unknown as { ticket_type: { event_id: string } }[]).map(
      (t) => t.ticket_type.event_id,
    ),
  );
  if ([...events.keys()].every((id) => covered.has(id))) return "skipped";

  // Once per payment, even if the sweep and a provider event both get here.
  const notifiedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await service
    .from("payment_attempt")
    .update({
      metadata: {
        ...(attempt.metadata ?? {}),
        failure_notified_at: notifiedAt,
      },
    })
    .eq("id", attempt.id)
    .eq("status", "failed")
    .is("metadata->>failure_notified_at", null)
    .select("id");
  if (claimError) throw new Error(claimError.message);
  if (!claimed || claimed.length === 0) return "skipped";

  const [eventId, event] = [...events.entries()][0];
  const single = events.size === 1;
  await createNotificationCore(service, {
    userId: attempt.user_id,
    type: "payment_failed",
    notice: single
      ? {
          id: "payment_not_through",
          params: {
            event: event.title,
            amountMinor,
            currency: attempt.currency,
          },
        }
      : {
          id: "payment_not_through_orders",
          params: { amountMinor, currency: attempt.currency },
        },
    link: single ? `/events/${event.code.toLowerCase()}` : "/transactions",
    data: single ? { kind: "event", eventId } : { kind: "ticket" },
  });
  return "sent";
}
