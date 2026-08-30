"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";

export async function getUserPlaceRole(userId: string) {
  const supabase = await createClient();

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!user || userError || user.id !== userId) {
      return { status: 401, role: "none" };
    }

    const { data: ownedPlace, error: ownedPlaceError } = await supabase
      .from("place")
      .select("owner_id")
      .eq("owner_id", userId)
      .limit(1);

    if (ownedPlaceError) {
      logger.error(`Error fetching owned places: ${ownedPlaceError.message}`);

      return { status: 500, message: "Something went wrong!" };
    }

    if (ownedPlace && ownedPlace.length > 0) {
      return { role: "owner" };
    }

    return { role: "none" };
  } catch (error) {
    logger.error("Error checking user place role:", error);
    return { role: "none" };
  }
}
