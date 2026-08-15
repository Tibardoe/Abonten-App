"use server";

import { createClient } from "@/config/supabase/server";
import type { UserPostType } from "@/types/postsType";
import { getEventAttendanceCounts } from "./getAttendace";

export async function getUserPosts(username: string) {
  const supabase = await createClient();

  const { data: user, error: userError } = await supabase
    .from("user_info")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (!user || userError) {
    console.log(`Error fetching user id: ${userError?.message}`);

    return { status: 500, message: "Something went wrong!" };
  }

  // const { data, error } = await supabase
  //   .from("event")
  //   .select(
  //     "*, user_info:event_organizer_id_fkey(username), ticket_type(price, currency)"
  //   )
  //   .eq("user_info.username", username);

  const { data, error } = await supabase
    .from("event")
    .select(
      "*, ticket_type(price, currency), event_occurrence(id, starts_at, ends_at)",
    )
    .eq("organizer_id", user.id)
    .order("created_at", { ascending: false })
    // Safety cap: no pagination yet, so bound the worst case instead of
    // shipping an unbounded event list.
    .limit(200);

  if (error) {
    return { status: 500, message: `Failed fetching events: ${error.message}` };
  }

  // Attendance counts for every event in one grouped query instead of one
  // round trip per event.
  const attendanceCounts = await getEventAttendanceCounts(
    data.map((event: UserPostType) => event.id),
  );

  const eventsWithMinPriceAndAttendance = data.map((event: UserPostType) => {
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

  // const eventsWithMinPrice = data.map((event: UserPostType) => {
  //   let min_price = 0;
  //   let currency = "";

  //   if (event.ticket_type && event.ticket_type.length > 0) {
  //     const minTicket = event.ticket_type.reduce((min, t) =>
  //       t.price < min.price ? t : min
  //     );
  //     min_price = minTicket.price;
  //     currency = minTicket.currency;
  //   }

  //   return {
  //     ...event,
  //     min_price,
  //     currency,
  //   };
  // });
  return { status: 200, eventsWithMinPriceAndAttendance };
}
