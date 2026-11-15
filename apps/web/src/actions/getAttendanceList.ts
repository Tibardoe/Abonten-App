"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type AttendanceRow,
  fetchEventAttendanceListPage,
} from "@abonten/services/organizer/organizerReadQuery";
import type { PaginatedResult } from "@abonten/types/pagination";

// Thin wrapper: auth, then delegate to the shared query body used by the
// mobile GET /api/mobile/organizer/events/:id/attendees route too — no
// logic fork.
export default withActionLocale(async function getAttendanceList(
  eventId: string,
  options?: { cursor?: string | null; pageSize?: number },
): Promise<PaginatedResult<AttendanceRow>> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return {
      status: 401,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: tr("userNotLoggedIn"),
    };
  }

  // Managing as a team: the chosen team, if the person's role covers this.

  const actor = await actingFor(user.id, "attendees.view");

  if (actor.error)
    return { ...actor.error, data: [], nextCursor: null, hasNextPage: false };

  return fetchEventAttendanceListPage(
    supabase,
    actor.accountId,
    eventId,
    options,
  );
});
