"use server";

import { createClient } from "@/config/supabase/server";
import {
  type GetTicketCheckoutCoreResult,
  getTicketCheckoutCore,
} from "@/utils/getTicketCheckoutCore";

export default async function getTicketCheckout(
  checkoutSessionId: string,
): Promise<GetTicketCheckoutCoreResult | { status: 401; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  return await getTicketCheckoutCore(supabase, user.id, checkoutSessionId);
}
