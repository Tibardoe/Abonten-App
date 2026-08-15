"use server";

import { createClient } from "@/config/supabase/server";
import type { FavoriteEvents, TicketType } from "@/types/favoriteEventTypes";
import { getEventAttendanceCounts } from "./getAttendace";

export async function getUserFavoritePosts() {
  const supabase = await createClient();

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Failed fetching user: ${userError.message}`,
    };
  }

  if (!user) {
    return { status: 401, message: "User not logged in" };
  }

  const { data, error } = await supabase
    .from("favorite")
    .select(
      "*, event (*, ticket_type(price, currency), event_occurrence(id, starts_at, ends_at))",
    )
    .eq("user_id", user.user.id)
    .order("created_at", { ascending: false })
    // Safety cap: no pagination yet, so bound the worst case instead of
    // shipping an unbounded favorites list.
    .limit(200);

  if (error) {
    return { status: 500, message: `Failed fetching events: ${error.message}` };
  }

  // Attendance counts for every favorited event in one grouped query
  // instead of one round trip per event.
  const attendanceCounts = await getEventAttendanceCounts(
    data.map((favorite: FavoriteEvents) => favorite.event.id),
  );

  // For each favorite, extract event + cheapest ticket + attendance count
  const favoritesWithMinPriceAndAttendance = data.map(
    (favorite: FavoriteEvents) => {
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
    },
  );

  return { status: 200, favoritesWithMinPriceAndAttendance };
}
