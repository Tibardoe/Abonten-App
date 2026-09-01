"use server";

import { createClient } from "@/config/supabase/server";
import {
  type GetUserPendingTicketCheckoutsCoreResult,
  getUserPendingTicketCheckoutsCore,
} from "@/utils/getUserPendingTicketCheckoutsCore";

export type {
  PendingCheckoutSession,
  PendingCheckoutSessionLine,
} from "@/utils/getUserPendingTicketCheckoutsCore";

type GetUserPendingTicketCheckoutsResult =
  | GetUserPendingTicketCheckoutsCoreResult
  | { status: 401; message: string };

/**
 * The order-summary "basket": every active, non-expired pending checkout
 * session across ALL of the user's events — not just the one named in a
 * /checkout/[checkoutId] URL. Self-heals expiry the same way every other
 * checkout read does. Post-auth logic lives in
 * getUserPendingTicketCheckoutsCore so the mobile API route shares it.
 */
export default async function getUserPendingTicketCheckouts(): Promise<GetUserPendingTicketCheckoutsResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  return await getUserPendingTicketCheckoutsCore(supabase, user.id);
}
