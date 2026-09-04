"use server";

import { createClient } from "@/config/supabase/server";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetOlderThan,
  splitPage,
} from "@abonten/core/pagination";
import type {
  FavoriteEvents,
  TicketType,
} from "@abonten/types/favoriteEventTypes";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import { getEventAttendanceCounts } from "./getAttendace";

export async function getUserFavoritePosts(options?: {
  cursor?: string | null;
  pageSize?: number;
}): Promise<PaginatedResult<FavoriteEvents>> {
  const supabase = await createClient();
  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: `Failed fetching user: ${userError.message}`,
    };
  }

  if (!user) {
    return {
      status: 401,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "User not logged in",
    };
  }

  let query = supabase
    .from("favorite")
    .select(
      "*, event (*, ticket_type(price, currency), event_occurrence(id, starts_at, ends_at))",
    )
    .eq("user_id", user.user.id)
    .order("created_at", { ascending: false })
    .order("event_id", { ascending: false })
    .limit(pageSize + 1);

  if (cursor) {
    query = query.or(keysetOlderThan("created_at", "event_id", cursor));
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

  const { page, hasNextPage } = splitPage<FavoriteEvents>(
    data as unknown as FavoriteEvents[],
    pageSize,
  );

  const attendanceCounts = await getEventAttendanceCounts(
    page.map((favorite) => favorite.event.id),
  );

  const favoritesWithMinPriceAndAttendance = page.map((favorite) => {
    const event = favorite.event;
    const tickets = event.ticket_type;

    const cheapestTicket = tickets?.length
      ? tickets.reduce(
          (min: TicketType, t: TicketType) => (t.price < min.price ? t : min),
          tickets[0],
        )
      : null;

    return {
      ...favorite,
      event: {
        ...event,
        price: cheapestTicket?.price,
        currency: cheapestTicket?.currency,
        attendanceCount: attendanceCounts[event.id] ?? 0,
      },
    };
  });

  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.created_at),
          id: last.event_id,
        })
      : null;

  return {
    status: 200,
    data: favoritesWithMinPriceAndAttendance,
    nextCursor,
    hasNextPage,
  };
}
