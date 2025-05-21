"use server";

import { createClient } from "@/config/supabase/server";

export default async function getOrganizerEvents() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error(userError?.message);
    return { status: 500, message: "User not logged in" };
  }

  const userId = user.id;

  const { data: events, error: eventsError } = await supabase
    .from("event")
    .select("*")
    .eq("organizer_id", userId);

  if (eventsError) {
    console.log(`Error fetching organizer's events: ${eventsError.message}`);

    return { status: 500, message: "Something went wrong!" };
  }

  //   if (!events || events.length === 0) {
  //     return { status: 404, message: "No events found!" };
  //   }

  //   const eventsWithTickets = events.map(async (event) => {
  //     const response = await getTickets(event.id);

  //     if (response.status !== 200) {
  //       console.log(response.message);
  //     }

  //     const ticket = response.tickets

  //     return {...events}
  //   });

  return { status: 200, data: events };
}
