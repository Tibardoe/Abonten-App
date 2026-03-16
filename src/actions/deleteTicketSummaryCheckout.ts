"use server";

import { createClient } from "@/config/supabase/server";

export default async function deleteTicketSummaryCheckout(checkoutId: string) {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData) {
    return { status: 401, message: "User not logged in" };
  }

  const { error: deleteError } = await supabase
    .from("ticket_checkout")
    .delete()
    .eq("id", checkoutId)
    .eq("user_id", userData.user.id);

  if (deleteError) {
    console.log(`Failed deleting ticket checkout: ${deleteError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, message: "Checkout deleted successfully!" };
}
