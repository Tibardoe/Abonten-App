"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import { tr } from "@abonten/services/i18n/requestLocale";
import { cancelEventTicketsCore } from "@abonten/services/tickets/cancelEventTicketsCore";

/**
 * Cancels every active ticket the caller holds for an event, and requests
 * the refund of each payment's share. Shared with
 * POST /api/mobile/tickets/cancel-event.
 */
export default withActionLocale(async function cancelEventTickets(
  eventId: string,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: tr("userNotLoggedIn") };
  }

  const result = await cancelEventTicketsCore(supabase, user.id, eventId);

  if (result.status === 200) {
    revalidateAppPath("/manage/my-events");
    revalidateAppPath(`/manage/events/${eventId}`);
    revalidateAppPath("/manage/dashboard");
    revalidateAppPath("/transactions");
  }

  return { status: result.status, message: result.message };
});
