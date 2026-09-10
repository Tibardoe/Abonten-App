"use server";

import { createClient } from "@/config/supabase/server";
import { getCreditActivityCore } from "@abonten/services/rewards/creditsQuery";
import type { PaginatedResult } from "@abonten/types/pagination";
import type { CreditActivityItem } from "@abonten/types/rewards";

/**
 * Cursor-paginated Abonten Credit activity for the signed-in user, newest
 * first. Same service as GET /api/mobile/rewards/activity.
 */
export async function getCreditActivity(options?: {
  cursor?: string | null;
  pageSize?: number;
}): Promise<PaginatedResult<CreditActivityItem>> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      status: 401,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "User not logged in",
    };
  }

  return getCreditActivityCore(supabase, user.id, options);
}
