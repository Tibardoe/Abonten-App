"use server";

import { createClient } from "@/config/supabase/server";

export default async function getAttendanceList(eventId: string) {
  const supabase = await createClient();

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!user || userError) {
      return { status: 401, message: "User not logged in" };
    }

    const { data: event, error: eventError } = await supabase
      .from("event")
      .select("id")
      .eq("id", eventId)
      .eq("organizer_id", user.id)
      .maybeSingle();

    if (eventError || !event) {
      return { status: 403, message: "Not authorized to view this event" };
    }

    const { data: attendanceList, error: attendanceListError } = await supabase
      .from("attendance")
      .select(
        "*, auth:id(email, phone), user_info:id(username, full_name), ticket_type(type, price, currency)",
      )
      .eq("event_id", eventId)
      // Safety cap: this has no pagination yet, so bound the worst case
      // (a very large or viral event) instead of shipping an unbounded
      // attendee list.
      .limit(1000);

    if (attendanceListError) {
      console.error("Supabase error:", attendanceListError.message);
      return { status: 500, message: "Something went wrong!" };
    }

    return { status: 200, data: attendanceList };
  } catch (error) {
    console.error("Unexpected error:", error);
    return { status: 500, message: "Unexpected server error", data: null };
  }
}
