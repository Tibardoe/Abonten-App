"use server";

import { createClient } from "@/config/supabase/server";
import type { HighlightGroup, HighlightRow } from "@/types/highlightType";
import { logger } from "@/utils/logger";

export default async function getUserHighlight(username: string) {
  const supabase = await createClient();

  const { data: userId, error: userIdError } = await supabase
    .from("user_info")
    .select("id")
    .eq("username", username)
    .single();

  if (!userId || userIdError) {
    logger.error(`Error fetching user id: ${userIdError?.message}`);

    return { status: 500, message: "Something went wrong!" };
  }

  const { data: highlights, error: highlightsError } = await supabase
    .from("highlight")
    .select("*")
    .eq("user_id", userId.id)
    // Safety cap, consistent with the other per-user list actions.
    .limit(200);

  if (highlightsError) {
    logger.error(`Error fetching highlights: ${highlightsError.message}`);
    return { status: 500, message: "Something went wrong! Try again later" };
  }

  // Group by group_id
  const grouped = highlights.reduce<Record<string, HighlightRow[]>>(
    (acc, highlight) => {
      const groupId = highlight.group_id;
      if (!acc[groupId]) acc[groupId] = [];
      acc[groupId].push(highlight);
      return acc;
    },
    {},
  );

  // Return grouped highlights as an array of groups
  const groupedHighlights: HighlightGroup[] = Object.values(grouped);

  return {
    status: 200,
    data: groupedHighlights,
  };
}
