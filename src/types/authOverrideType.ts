import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lets a small set of checkout-completion actions (generateTicket,
 * insertUserAttendance, ticketPurchaseNotification, getTicketsByIds,
 * activateSubscription) be driven by a caller that already resolved the
 * user server-side with its own Supabase client, instead of deriving the
 * session from request cookies. The only real caller today is the Paystack
 * webhook (src/app/api/paystack/webhook/route.ts) — it has no browser
 * session, so its authorization comes from a verified webhook signature,
 * not a Supabase session, and it uses the service-role client
 * (src/config/supabase/serviceClient.ts) to act on the paying user's behalf.
 *
 * Every existing call site omits this and keeps deriving the user from
 * cookies exactly as before — this is purely additive.
 */
export type AuthOverride = {
  supabase: SupabaseClient;
  userId: string;
  userEmail?: string | null;
};
