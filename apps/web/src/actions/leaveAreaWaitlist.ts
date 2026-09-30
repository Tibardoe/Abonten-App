"use server";

import { createClient } from "@/config/supabase/server";
import { leaveAreaWaitlistCore } from "@abonten/services/markets/areaWaitlistCore";

/** Takes the signed-in person off the waiting list for this area. */
export default async function leaveAreaWaitlist(input: {
  lat: number;
  lng: number;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: "User not logged in" };
  return leaveAreaWaitlistCore(user.id, input);
}
