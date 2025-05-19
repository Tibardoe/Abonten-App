"use server";

import { createClient } from "@/config/supabase/server";

export default async function cancelEvent(eventId: string) {
  const supabase = await createClient();

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not Logged in" };
  }

  const { data: updateError } = await supabase
    .from("event")
    .update({ status: "canceled" })
    .eq("id", eventId);

  if (updateError) {
    console.log(`Error updating event status: ${updateError}`);
    return {
      status: 500,
      message: "There was an error updating the event status. Please try again",
    };
  }

  return { status: 200, mesage: "Event status updated successfully." };
}
