"use server";

import { createClient } from "@/config/supabase/server";

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

  return { status: 200, data, error: null };
}
