"use server";

import { createClient } from "@/config/supabase/server";
import type { UserPostType } from "@/types/postsType";

export async function getUserPosts(username: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("event")
    .select(
      "*, user_info:event_organizer_id_fkey(username), ticket_type(price, currency)",
    )
    .eq("user_info.username", username);

  if (error) {
    return { status: 500, message: `Failed fetching events: ${error.message}` };
  }

  // Find minimum price ticket type per event
  const eventsWithMinPrice = data.reduce(
    (acc: UserPostType[], event: UserPostType) => {
      if (!event.ticket_type || event.ticket_type.length === 0) return acc;

      const minTicket = event.ticket_type.reduce((min, t) =>
        t.price < min.price ? t : min,
      );

      acc.push({
        ...event,
        min_price: minTicket.price,
        currency: minTicket.currency,
      });

      return acc;
    },
    [],
  );

  return { status: 200, eventsWithMinPrice };
}
