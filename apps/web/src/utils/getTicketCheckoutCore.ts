import { logger } from "@abonten/core/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth body of getTicketCheckout — shared with
// `/api/mobile/checkout/session/[sessionId]`. See getTicketCheckout.ts.

export type GetTicketCheckoutCoreResult =
  // `data` rows come from an untyped `select("*, event(...), ticket_type(...)")`
  // and are consumed as `any` by the web checkout page — kept that way so
  // extracting this helper doesn't change the shape callers already rely on.
  // biome-ignore lint/suspicious/noExplicitAny: preserve the pre-extraction row shape
  { status: 200; data: any[] | null } | { status: 500; message: string };

export async function getTicketCheckoutCore(
  supabase: SupabaseClient,
  userId: string,
  checkoutSessionId: string,
): Promise<GetTicketCheckoutCoreResult> {
  // Self-heal: reclaim this checkout if its reservation window has passed,
  // so a page load (including a browser-back revisit) always reflects an
  // accurate status instead of a stale 'pending' row.
  await supabase.rpc("expire_stale_ticket_checkouts");

  const { data: checkoutData, error: checkoutDataError } = await supabase
    .from("ticket_checkout")
    .select(
      "*, event:event_id(title, event_code, starts_at, ends_at, event_occurrence(*)),ticket_type:ticket_type_id(type, currency)",
    )
    .eq("checkout_session_id", checkoutSessionId)
    .eq("user_id", userId);

  if (checkoutDataError) {
    logger.error(`Failed fetching checout data: ${checkoutDataError.message}`);

    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, data: checkoutData };
}
