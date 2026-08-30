"use server";

import { createClient } from "@/config/supabase/server";
import { issueRefundCore } from "@/utils/issueRefundCore";

/**
 * Refunds a transaction via Paystack and moves it into the refund_pending
 * state. Takes only an id (not a caller-supplied transaction object) and
 * re-checks ownership itself — this is a directly-callable Server Action, so
 * it can't trust that a caller already verified that.
 *
 * Customer-paid-service-fee model: the customer is refunded the ticket
 * revenue only; Abonten's service fee is retained. The actual pipeline
 * lives in issueRefundCore so cancelEvent.ts (organizer session, already
 * ownership-verified by the cancellation RPC) can drive the same flow via a
 * service-role client. See src/utils/issueRefundCore.ts.
 */
export default async function issueRefund(transactionId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  return issueRefundCore(supabase, transactionId, { expectedUserId: user.id });
}
