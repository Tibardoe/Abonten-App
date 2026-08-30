"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetOlderThan,
  splitPage,
} from "@abonten/core/pagination";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type { UserPostType } from "@abonten/types/postsType";
import { getEventAttendanceCounts } from "./getAttendace";

export async function getUserPosts(
  username: string,
  options?: { cursor?: string | null; pageSize?: number },
): Promise<PaginatedResult<UserPostType>> {
  const supabase = await createClient();
  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  const { data: user, error: userError } = await supabase
    .from("user_info")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (!user || userError) {
    logger.error(`Error fetching user id: ${userError?.message}`);

    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong!",
    };
  }

  let query = supabase
    .from("event")
    .select(
      "*, ticket_type(price, currency), event_occurrence(id, starts_at, ends_at)",
    )
    .eq("organizer_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (cursor) {
    query = query.or(keysetOlderThan("created_at", "id", cursor));
  }

  const { data, error } = await query;

  if (error) {
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: `Failed fetching events: ${error.message}`,
    };
  }

  const { page, hasNextPage } = splitPage<UserPostType>(data, pageSize);

  const attendanceCounts = await getEventAttendanceCounts(
    page.map((event) => event.id),
  );

  const eventsWithMinPriceAndAttendance = page.map((event) => {
    let min_price = 0;
    let currency = "";

    if (event.ticket_type && event.ticket_type.length > 0) {
      const minTicket = event.ticket_type.reduce((min, t) =>
        t.price < min.price ? t : min,
      );
      min_price = minTicket.price;
      currency = minTicket.currency;
    }

    return {
      ...event,
      min_price,
      currency,
      attendanceCount: attendanceCounts[event.id] ?? 0,
    };
  });

  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.created_at),
          id: last.id,
        })
      : null;

  return {
    status: 200,
    data: eventsWithMinPriceAndAttendance,
    nextCursor,
    hasNextPage,
  };
}
