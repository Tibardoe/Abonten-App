import { logger } from "@abonten/core/logger";
import type { AuthOverride } from "@abonten/types/authOverrideType";
import { getSupabaseServiceClient } from "../../supabase/serviceClient";
import { notifyCampaign } from "../contentNotifyCore";

// The fulfilment step for a paid campaign checkout — the fourth
// PaymentFulfillmentDeps member, called only by finalizePaystackPayment once
// it has a verified `transaction` row for this checkout (same guard the
// event / place promotion activations use: an attempt for this checkout,
// owned by this user, carrying a successful transaction). Framework-free,
// so it lives here rather than in apps/web; idempotent through the ledger
// key inside content_campaign_activate_from_checkout().

export default async function activateContentCampaign(
  checkoutId: string,
  authOverride: AuthOverride,
): Promise<{ status: number; message?: string }> {
  const supabase = getSupabaseServiceClient();
  const userId = authOverride.userId;

  const { data: attempts, error: attemptsError } = await supabase
    .from("payment_attempt")
    .select("id, transaction_id, transaction:transaction_id(id, status)")
    .eq("content_campaign_checkout_id", checkoutId)
    .eq("user_id", userId)
    .in("status", ["processing", "succeeded"])
    .not("transaction_id", "is", null);
  if (attemptsError) {
    logger.error(
      `activateContentCampaign: attempt read failed: ${attemptsError.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }
  const verified = (attempts ?? []).find(
    (a) =>
      (a.transaction as unknown as { status: string } | null)?.status ===
      "successful",
  );
  if (!verified?.transaction_id) {
    logger.error(
      `activateContentCampaign: no verified payment for checkout ${checkoutId}`,
    );
    return { status: 402, message: "Payment not verified for this checkout" };
  }

  await supabase.rpc("expire_stale_content_campaign_checkouts");

  const { data, error } = await supabase.rpc(
    "content_campaign_activate_from_checkout",
    {
      p_checkout_id: checkoutId,
      p_transaction_id: verified.transaction_id,
      p_user_id: userId,
    },
  );
  if (error) {
    // A checkout that already went 'paid' on an earlier run answers as a
    // replay inside the function; anything else is a real failure.
    if (error.code === "22023" && /Checkout is paid/.test(error.message)) {
      return { status: 200, message: "Campaign already activated" };
    }
    logger.error(`activateContentCampaign: ${error.message}`);
    return { status: 500, message: error.message };
  }
  const result = (data ?? {}) as { campaign_id?: string; replayed?: boolean };
  if (result.campaign_id && !result.replayed) {
    await notifyCampaign(supabase, {
      id: result.campaign_id,
      advertiserId: userId,
      status: "pending_review",
      reason:
        "We check every promotion before it runs. You'll hear from us when it's approved.",
    });
  }
  return { status: 200, message: "Campaign submitted for review" };
}
