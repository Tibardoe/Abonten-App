"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { logger } from "@abonten/core/logger";
import { tr } from "@abonten/services/i18n/requestLocale";
import { fetchOrganizerEventsPage } from "@abonten/services/organizer/organizerReadQuery";
import type { PaginatedResult } from "@abonten/types/pagination";
import type { UserPostType } from "@abonten/types/postsType";

export default withActionLocale(async function getOrganizerEvents(options?: {
  cursor?: string | null;
  pageSize?: number;
}): Promise<PaginatedResult<UserPostType>> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    logger.error(userError?.message);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: tr("userNotLoggedIn"),
    };
  }

  // Managing as a team: the chosen team, if the person's role covers this.

  const actor = await actingFor(user.id, [
    "events.manage",
    "attendees.view",
    "checkin.scan",
    "money.view",
    "reviews.reply",
  ]);

  if (actor.error)
    return { ...actor.error, data: [], nextCursor: null, hasNextPage: false };

  return fetchOrganizerEventsPage(supabase, actor.accountId, options);
});
