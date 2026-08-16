"use server";

import { createClient } from "@/config/supabase/server";

export default async function getTicketCheckout(checkoutSessionId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

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
    .eq("user_id", user.id);

  if (checkoutDataError) {
    console.log(`Failed fetching checout data: ${checkoutDataError.message}`);

    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, data: checkoutData };
}
