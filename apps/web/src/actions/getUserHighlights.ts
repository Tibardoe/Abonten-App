"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { logger } from "@abonten/core/logger";
import { tr } from "@abonten/services/i18n/requestLocale";
import type {
  HighlightGroup,
  HighlightRow,
} from "@abonten/types/highlightType";

export default withActionLocale(async function getUserHighlight(
  username: string,
) {
  const supabase = await createClient();

  const { data: userId, error: userIdError } = await supabase
    .from("user_info")
    .select("id")
    .eq("username", username)
    .single();

  if (!userId || userIdError) {
    logger.error(`Error fetching user id: ${userIdError?.message}`);

    return { status: 500, message: tr("somethingWentWrong") };
  }

  const { data: highlights, error: highlightsError } = await supabase
    .from("highlight")
    .select("*")
    .eq("user_id", userId.id)
    // Safety cap, consistent with the other per-user list actions.
    .limit(200);

  if (highlightsError) {
    logger.error(`Error fetching highlights: ${highlightsError.message}`);
    return {
      status: 500,
      message: tr("somethingWentWrongTryAgainLater"),
    };
  }

  // Group by group_id
  const grouped = highlights.reduce<Record<string, HighlightRow[]>>(
    (acc, highlight) => {
      const groupId = highlight.group_id;
      if (!acc[groupId]) acc[groupId] = [];
      acc[groupId].push(highlight as unknown as HighlightRow);
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
});
