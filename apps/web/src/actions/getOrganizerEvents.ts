"use server";

import { createClient } from "@/config/supabase/server";
import { fetchOrganizerEventsPage } from "@/utils/organizerReadQuery";
import { logger } from "@abonten/core/logger";
import type { PaginatedResult } from "@abonten/types/pagination";
import type { UserPostType } from "@abonten/types/postsType";

export default async function getOrganizerEvents(options?: {
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
      message: "User not logged in",
    };
  }

  return fetchOrganizerEventsPage(supabase, user.id, options);
}
