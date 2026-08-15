"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import type { UserPostType } from "@/types/postsType";
import { getEventAttendanceCounts } from "./getAttendace";

export async function getNearByEvents(
  lat: number,
  lng: number,
  radius: number,
) {
  const supabase = publicSupabase;

  const { data, error } = await supabase
    .rpc("get_nearby_events", {
      user_lat: lat,
      user_lng: lng,
      search_radius: radius,
    })
    // Safety cap: no pagination yet, so bound the worst case (a dense city
    // with a wide radius) instead of shipping an unbounded event list.
    .limit(200);

  if (error) {
    console.log(`Error fetching get nearby events: ${error.message}`);

    return { status: 500, data: null, error };
  }

  // Attach attendance counts to each event via a single grouped query
  // instead of one round trip per event.
  const attendanceCounts = await getEventAttendanceCounts(
    data.map((event: UserPostType) => event.id),
  );

  const eventsWithAttendance = data.map((event: UserPostType) => ({
    ...event,
    attendanceCount: attendanceCounts[event.id] ?? 0,
  }));

  return { status: 200, data: eventsWithAttendance, error: null };
}
