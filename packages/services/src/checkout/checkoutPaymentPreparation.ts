import type { Database } from "@abonten/types/database.types";
// Shared server-side logic for turning a set of selected pending checkout
// sessions into an authoritative payment summary — reused by
// prepareMultiCheckoutPayment.ts (read-only preview) and
// createMultiCheckoutPaymentAttempt.ts (the write path). Deliberately NOT a
// "use server" Server Action — see ticketInventory.ts/promoUsage.ts for why:
// it accepts an arbitrary userId with no session binding of its own, so it
// must only ever be reached through actions that already resolved userId
// from the caller's own session. Never trusts client-supplied prices/totals:
// every number here comes from the already-authoritative ticket_checkout
// rows (locked in at checkout creation / quantity-update time), re-read
// fresh on every call after self-healing expiry.

import { computeCheckoutFee } from "@abonten/core/checkoutPricing";
import { getActiveServiceFeeRate } from "@abonten/services/platform/platformFee";
import type { SupabaseClient } from "@supabase/supabase-js";

type CheckoutRow = {
  checkout_session_id: string;
  total_price: number;
  discount: number;
  event: { title: string } | null;
  ticket_type: { currency: string } | null;
};

export type PreparedCheckoutSession = {
  checkoutSessionId: string;
  eventTitle: string;
  subtotal: number;
  discount: number;
  fee: number;
  total: number;
};

export type PreparedCheckoutPayment = {
  validSessions: PreparedCheckoutSession[];
  invalidSessionIds: string[];
  grandTotal: number;
  currency: string;
};

/**
 * Re-reads the given checkout sessions fresh (after self-healing expiry),
 * scoped to the given user, and computes what's actually owed right now.
 * Any requested session id that no longer has pending rows (expired,
 * already paid elsewhere, or never belonged to this user) is reported back
 * in invalidSessionIds instead of silently dropped.
 */
export async function prepareCheckoutPayment(
  userId: string,
  checkoutSessionIds: string[],
  client: SupabaseClient<Database>,
): Promise<PreparedCheckoutPayment> {
  // `client` lets an already-authenticated caller (the mobile checkout
  // routes) reuse its own Supabase client; the "use server" actions omit it
  // and get the cookie client exactly as before.
  const supabase = client;
  const uniqueIds = Array.from(new Set(checkoutSessionIds));

  await supabase.rpc("expire_stale_ticket_checkouts");

  const { data, error } = await supabase
    .from("ticket_checkout")
    .select(
      "checkout_session_id, total_price, discount, event:event_id(title), ticket_type:ticket_type_id(currency)",
    )
    .in("checkout_session_id", uniqueIds)
    .eq("user_id", userId)
    .eq("status", "pending");

  if (error) {
    throw new Error(`Failed fetching checkout sessions: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as CheckoutRow[];

  const sessionsById = new Map<string, PreparedCheckoutSession>();
  let currency = "GHS";

  for (const row of rows) {
    let session = sessionsById.get(row.checkout_session_id);

    if (!session) {
      session = {
        checkoutSessionId: row.checkout_session_id,
        eventTitle: row.event?.title ?? "",
        subtotal: 0,
        discount: 0,
        fee: 0,
        total: 0,
      };
      sessionsById.set(row.checkout_session_id, session);
    }

    session.subtotal += row.total_price + row.discount;
    session.discount += row.discount;
    session.total += row.total_price;
    currency = row.ticket_type?.currency ?? currency;
  }

  const feeRate = await getActiveServiceFeeRate(supabase, currency);

  for (const session of sessionsById.values()) {
    session.fee = computeCheckoutFee(session.total, feeRate);
    session.total += session.fee;
  }

  const validSessions = Array.from(sessionsById.values());
  const invalidSessionIds = uniqueIds.filter((id) => !sessionsById.has(id));
  const grandTotal = validSessions.reduce((sum, s) => sum + s.total, 0);

  return { validSessions, invalidSessionIds, grandTotal, currency };
}
