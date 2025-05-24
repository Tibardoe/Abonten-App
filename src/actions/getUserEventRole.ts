"use server";

import { createClient } from "@/config/supabase/server";

export async function getUserEventRole(userId: string) {
  const supabase = await createClient();

  try {
    const roles: ("organizer" | "attendee")[] = [];
    // Check if user is an organizer
    const { data: organizerEvent, error: organizerEventError } = await supabase
      .from("event")
      .select("organizer_id")
      .eq("organizer_id", userId);

    if (organizerEventError) {
      console.log(
        `Error fetching organizer events: ${organizerEventError.message}`,
      );

      return { status: 500, message: "Something went wrong!" };
    }

    if (organizerEvent && organizerEvent.length > 0) {
      roles.push("organizer");
    }

    // Check if user is an attendee
    const { data: attendeeEntry, error: attendeeEntryError } = await supabase
      .from("ticket")
      .select("user_id")
      .eq("user_id", userId);

    if (attendeeEntryError) {
      console.log(
        `Error fetching organizer events: ${attendeeEntryError.message}`,
      );

      return { status: 500, message: "Something went wrong!" };
    }

    if (attendeeEntry && attendeeEntry.length > 0) {
      roles.push("attendee");
    }

    if (roles.length === 0) {
      return { role: "none" };
    }

    return { role: roles };
  } catch (error) {
    console.error("Error checking user event role:", error);
    return { role: "none" };
  }
}
