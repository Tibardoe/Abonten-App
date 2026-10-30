"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type CancelTicketScope,
  cancelUserTicketCore,
} from "@abonten/services/tickets/cancelUserTicketCore";

/**
 * Cancels one of the caller's tickets ("payment": with the other tickets
 * the same payment bought). Once every ticket of a paid payment is
 * cancelled, a partial refund of the ticket revenue (the Abonten service
 * fee is retained) is requested.
 * Post-auth logic lives in cancelUserTicketCore so the mobile API route
 * shares it.
 */
export default withActionLocale(async function cancelUserTicket(
  ticketId: string,
  transactionId: string | null,
  scope: CancelTicketScope = "ticket",
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: tr("userNotLoggedIn") };
  }

  const result = await cancelUserTicketCore(
    supabase,
    user.id,
    ticketId,
    transactionId,
    { scope: scope === "payment" ? "payment" : "ticket" },
  );

  if (result.status === 200) {
    revalidateAppPath("/manage/my-events");
    if (result.eventId) {
      revalidateAppPath(`/manage/events/${result.eventId}`);
    }
    revalidateAppPath("/manage/dashboard");
    revalidateAppPath("/transactions");
    // See generateTicket.ts for why the public event page also needs this —
    // cancelling restores a spot, and that must be visible without a refresh.
    if (result.eventCode) {
      revalidateAppPath(`/events/${result.eventCode.toLowerCase()}`);
    }
  }

  return { status: result.status, message: result.message };
});
