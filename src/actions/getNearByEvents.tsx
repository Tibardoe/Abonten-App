"use server";

import { createClient } from "@/config/supabase/server";
import type { UserPostType } from "@/types/postsType";
import { getEventAttendanceCount } from "./getAttendace";

export async function getNearByEvents(
  lat: number,
  lng: number,
  radius: number,
) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_nearby_events", {
    user_lat: lat,
    user_lng: lng,
    search_radius: radius,
  });

  if (error) {
    return { status: 500, data: null, error };
  }

  // Attach attendance counts to each event
  const eventsWithAttendance = await Promise.all(
    data.map(async (event: UserPostType) => {
      const { count } = await getEventAttendanceCount(event.id);

      return {
        ...event,
        attendanceCount: count ?? 0,
      };
    }),
  );

  return { status: 200, data: eventsWithAttendance, error: null };
}
