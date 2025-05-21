"use server";

import { createClient } from "@/config/supabase/server";

export async function getUserEventRole(userId: string) {
  const supabase = await createClient();

  try {
    // Check if user is an organizer
    const { data: organizerEvent, error: organizerEventError } = await supabase
      .from("event")
      .select("organizer_id")
      .eq("id", userId);

    if (organizerEventError) {
      console.log(
        `Error fetching organizer events: ${organizerEventError.message}`,
      );

      return { status: 500, message: "Something went wrong!" };
    }

    if (organizerEvent) {
      return { role: "organizer" };
    }

    // Check if user is an attendee
    const { data: attendeeEntry, error: attendeeEntryError } = await supabase
      .from("attendance")
      .select("user_id")
      .eq("user_id", userId);

    if (attendeeEntryError) {
      console.log(
        `Error fetching organizer events: ${attendeeEntryError.message}`,
      );

      return { status: 500, message: "Something went wrong!" };
    }

    if (attendeeEntry) {
      return { role: "attendee" };
    }

    return { role: "none" };
  } catch (error) {
    console.error("Error checking user event role:", error);
    return { role: "none" };
  }
}
