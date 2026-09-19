import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth body of getTicketCheckout — shared with
// `/api/mobile/checkout/session/[sessionId]`. See getTicketCheckout.ts.

export type TicketCheckoutRow =
  Database["public"]["Tables"]["ticket_checkout"]["Row"] & {
    event: {
      title: string;
      event_code: string;
      starts_at: string | null;
      ends_at: string | null;
      event_occurrence: Database["public"]["Tables"]["event_occurrence"]["Row"][];
    } | null;
    ticket_type: { type: string | null; currency: string | null } | null;
  };

export type GetTicketCheckoutCoreResult =
  | { status: 200; data: TicketCheckoutRow[] | null }
  | { status: 500; message: string };

export async function getTicketCheckoutCore(
  supabase: SupabaseClient<Database>,
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
