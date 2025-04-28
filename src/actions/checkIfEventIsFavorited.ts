"use server";

import { createClient } from "@/config/supabase/server";

export async function checkIfEventIsFavorited(eventId: string) {
  const supabase = await createClient();

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      isFavorited: false,
    };
  }

  if (!user) {
    return { status: 401, isFavorited: false };
  }

  const { data, error } = await supabase
    .from("favorite")
    .select("*")
    .eq("event_id", eventId)
    .eq("user_id", user.user.id)
    .maybeSingle(); // maybeSingle avoids crashing if not found

  if (error) {
    return { status: 500, isFavorited: false };
  }

  return { status: 200, isFavorited: !!data };
}
