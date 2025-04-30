"use server";

import { createClient } from "@/config/supabase/server";
import type { FavoriteEvents, TicketType } from "@/types/favoriteEventTypes";
import { getEventAttendanceCount } from "./getAttendace";

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
    .select("*, event (*, ticket_type(price, currency))")
    .eq("user_id", user.user.id);

  if (error) {
    return { status: 500, message: `Failed fetching events: ${error.message}` };
  }

  // For each favorite, extract event + cheapest ticket + attendance count
  const favoritesWithMinPriceAndAttendance = await Promise.all(
    data.map(async (favorite: FavoriteEvents) => {
      const event = favorite.event;
      const tickets = event.ticket_type;

      const cheapestTicket = tickets?.length
        ? tickets.reduce(
            (min: TicketType, t: TicketType) => (t.price < min.price ? t : min),
            tickets[0],
          )
        : null;

      // Get the attendance count for the event
      const attendanceResponse = await getEventAttendanceCount(event.id);

      return {
        ...favorite,
        event: {
          ...event,
          price: cheapestTicket?.price,
          currency: cheapestTicket?.currency,
          attendanceCount: attendanceResponse?.count,
        },
      };
    }),
  );

  return { status: 200, favoritesWithMinPriceAndAttendance };
}
