"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type CheckInTicketCoreResult,
  checkInTicketCore,
} from "@abonten/services/tickets/checkInTicketCore";

// Thin wrapper: auth, delegate to the shared body (also used by the mobile
// POST /api/mobile/organizer/tickets/:id/check-in route), then revalidate
// the management page on success.
export default withActionLocale(async function checkInTicket(
  ticketId: string,
  checkedIn: boolean,
  expectedEventId?: string | null,
): Promise<CheckInTicketCoreResult | { status: 401; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: tr("userNotLoggedIn") };
  }

  const result = await checkInTicketCore(
    supabase,
    user.id,
    ticketId,
    checkedIn,
    expectedEventId,
  );

  if (result.status === 200 && result.eventId) {
    revalidateAppPath(`/manage/events/${result.eventId}`);
  }

  return result;
});
