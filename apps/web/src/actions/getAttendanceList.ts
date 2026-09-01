"use server";

import { createClient } from "@/config/supabase/server";
import { fetchEventAttendanceListPage } from "@/utils/organizerReadQuery";
import type { PaginatedResult } from "@abonten/types/pagination";

// Thin wrapper: auth, then delegate to the shared query body used by the
// mobile GET /api/mobile/organizer/events/:id/attendees route too — no
// logic fork.
export default async function getAttendanceList(
  eventId: string,
  options?: { cursor?: string | null; pageSize?: number },
  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
): Promise<PaginatedResult<any>> {
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
      message: "User not logged in",
    };
  }

  return fetchEventAttendanceListPage(supabase, user.id, eventId, options);
}
