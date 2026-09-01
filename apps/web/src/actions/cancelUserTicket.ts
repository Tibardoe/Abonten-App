"use server";

import { createClient } from "@/config/supabase/server";
import { cancelUserTicketCore } from "@/utils/cancelUserTicketCore";
import { revalidatePath } from "next/cache";

/**
 * Cancels one of the caller's tickets. If it was paid and this makes every
 * ticket sharing its transaction cancelled, a partial Paystack refund of
 * the ticket revenue (the Abonten service fee is retained) is requested.
 * Post-auth logic lives in cancelUserTicketCore so the mobile API route
 * shares it.
 */
export default async function cancelUserTicket(
  ticketId: string,
  transactionId: string | null,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  const result = await cancelUserTicketCore(
    supabase,
    user.id,
    ticketId,
    transactionId,
  );

  if (result.status === 200) {
    revalidatePath("/manage/my-events");
    if (result.eventId) {
      revalidatePath(`/manage/events/${result.eventId}`);
    }
    revalidatePath("/manage/dashboard");
    revalidatePath("/transactions");
    // See generateTicket.ts for why the public event page also needs this —
    // cancelling restores a spot, and that must be visible without a refresh.
    if (result.eventCode) {
      revalidatePath(`/events/${result.eventCode.toLowerCase()}`);
    }
  }

  return { status: result.status, message: result.message };
}
