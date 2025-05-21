"use server";

import { createClient } from "@/config/supabase/server";

export default async function getUserAttendingEvents() {
  const supabase = await createClient();

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error(userError?.message);
      return { status: 500, message: "User not logged in" };
    }

    const userId = user.id;

    const { data: attendingEvents, error: attendingEventsError } =
      await supabase
        .from("attendance")
        .select("*, event(*), ticket_type:ticket_type_id(*)")
        .eq("user_id", userId);

    if (attendingEventsError) {
      console.error(
        `Error fetching user attending events:${attendingEventsError.message}`,
      );

      return { status: 500, message: "Something went wrong" };
    }

    if (!attendingEvents || attendingEvents.length === 0) {
      return { status: 404, message: "No events found!" };
    }

    return { status: 200, data: attendingEvents };
  } catch (error) {}
}
