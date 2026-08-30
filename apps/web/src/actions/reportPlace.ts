"use server";

import { createClient } from "@/config/supabase/server";

export async function reportPlace(placeId: string, reason: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { error: insertError } = await supabase.from("place_report").insert({
    place_id: placeId,
    reporter_id: user.id,
    reason,
    status: "pending",
  });

  if (insertError) {
    return {
      status: 500,
      message: `Error reporting place: ${insertError.message}`,
    };
  }

  return { status: 200, message: "Report submitted. Thank you." };
}
