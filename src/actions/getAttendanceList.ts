"use server";

import { createClient } from "@/config/supabase/server";

export default async function getAttendanceList(eventId: string) {
  const supabase = await createClient();

  try {
    const { data: attendanceList, error: attendanceListError } = await supabase
      .from("attendance")
      .select("*")
      .eq("event_id", eventId);

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
