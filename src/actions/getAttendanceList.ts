"use server";

import { createClient } from "@/config/supabase/server";
import type { PaginatedResult, SimpleCursor } from "@/types/pagination";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetOlderThan,
  splitPage,
} from "@/utils/pagination";

export default async function getAttendanceList(
  eventId: string,
  options?: { cursor?: string | null; pageSize?: number },
  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
): Promise<PaginatedResult<any>> {
  const supabase = await createClient();
  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  try {
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

    const { data: event, error: eventError } = await supabase
      .from("event")
      .select("id")
      .eq("id", eventId)
      .eq("organizer_id", user.id)
      .maybeSingle();

    if (eventError || !event) {
      return {
        status: 403,
        data: [],
        nextCursor: null,
        hasNextPage: false,
        message: "Not authorized to view this event",
      };
    }

    let query = supabase
      .from("attendance")
      .select(
        "*, auth:id(email, phone), user_info:id(username, full_name), ticket_type(type, price, currency)",
      )
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(pageSize + 1);

    if (cursor) {
      query = query.or(keysetOlderThan("created_at", "id", cursor));
    }

    const { data: attendanceList, error: attendanceListError } = await query;

    if (attendanceListError) {
      console.error("Supabase error:", attendanceListError.message);
      return {
        status: 500,
        data: [],
        nextCursor: null,
        hasNextPage: false,
        message: "Something went wrong!",
      };
    }

    // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
    const { page, hasNextPage } = splitPage<any>(attendanceList, pageSize);

    const last = page[page.length - 1];
    const nextCursor =
      hasNextPage && last
        ? encodeCursor<SimpleCursor>({
            sortValue: String(last.created_at),
            id: last.id,
          })
        : null;

    return { status: 200, data: page, nextCursor, hasNextPage };
  } catch (error) {
    console.error("Unexpected error:", error);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Unexpected server error",
    };
  }
}
