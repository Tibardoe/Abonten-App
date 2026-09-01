"use server";

import { createClient } from "@/config/supabase/server";
import {
  type CheckInTicketCoreResult,
  checkInTicketCore,
} from "@/utils/checkInTicketCore";
import { revalidatePath } from "next/cache";

// Thin wrapper: auth, delegate to the shared body (also used by the mobile
// POST /api/mobile/organizer/tickets/:id/check-in route), then revalidate
// the management page on success.
export default async function checkInTicket(
  ticketId: string,
  checkedIn: boolean,
): Promise<CheckInTicketCoreResult | { status: 401; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  const result = await checkInTicketCore(
    supabase,
    user.id,
    ticketId,
    checkedIn,
  );

  if (result.status === 200 && result.eventId) {
    revalidatePath(`/manage/events/${result.eventId}`);
  }

  return result;
}
