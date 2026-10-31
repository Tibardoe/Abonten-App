import { logger } from "@abonten/core/logger";
import { tr } from "../i18n/requestLocale";
import { releaseOpenReservations } from "../rewards/creditRedemptionCore";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

/**
 * Cancels the open attempts on these sessions (all of them, or only those
 * started with credit) and gives their held credit back, so a new attempt
 * starts clean or the order can be cancelled. Refuses while one is being
 * finalized ('processing'). A payment made afterwards on a closed attempt's
 * page is an orphan capture and is refunded in full (orphanCapture.ts).
 */
export async function dropOpenAttempts(
  userId: string,
  checkoutSessionIds: string[],
  { onlyCredit, reason }: { onlyCredit: boolean; reason: string },
): Promise<"ok" | { status: 409 | 500; message: string }> {
  const service = getSupabaseServiceClient();
  const { data: open, error } = await service
    .from("payment_attempt")
    .select("id, status, credit_amount, payment_group_id")
    .in("checkout_session_id", checkoutSessionIds)
    .eq("user_id", userId)
    .in("status", ["initiated", "pending", "processing"]);

  if (error) {
    logger.error(`Failed checking open attempts: ${error.message}`);
    return { status: 500, message: tr("somethingWentWrong") };
  }

  const affected = (open ?? []).filter(
    (a) => !onlyCredit || Number(a.credit_amount) > 0,
  );
  if (affected.some((a) => a.status === "processing")) {
    return {
      status: 409,
      message: tr("aPaymentForThisOrderIs"),
    };
  }
  if (affected.length === 0) return "ok";

  const { error: cancelError } = await service
    .from("payment_attempt")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .in(
      "id",
      affected.map((a) => a.id),
    )
    .eq("user_id", userId)
    .in("status", ["initiated", "pending"]);
  if (cancelError) {
    logger.error(`Failed cancelling open attempts: ${cancelError.message}`);
    return { status: 500, message: tr("somethingWentWrong") };
  }

  const groups = Array.from(
    new Set(
      affected.map((a) => a.payment_group_id).filter((g): g is string => !!g),
    ),
  );
  try {
    for (const group of groups) {
      await releaseOpenReservations("ticket_payment_group", group, reason);
    }
  } catch {
    return { status: 500, message: tr("somethingWentWrong") };
  }
  return "ok";
}
