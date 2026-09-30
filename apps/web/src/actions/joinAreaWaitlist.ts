"use server";

import { createClient } from "@/config/supabase/server";
import { joinAreaWaitlistCore } from "@abonten/services/markets/areaWaitlistCore";
import type { AreaWaitlistJoinBody } from "@abonten/types/marketType";

/**
 * "Tell me when it launches": puts the signed-in person on the waiting list
 * for the area at this point. The server re-checks that Abonten hasn't
 * launched there and records the city (or a ~1 km cell), never the exact
 * point.
 */
export default async function joinAreaWaitlist(input: AreaWaitlistJoinBody) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: "User not logged in" };
  return joinAreaWaitlistCore(user.id, { ...input, source: "web" });
}
