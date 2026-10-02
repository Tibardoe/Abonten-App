"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { logger } from "@abonten/core/logger";
import { tr } from "@abonten/services/i18n/requestLocale";
import { fetchOrganizerPlacesPage } from "@abonten/services/organizer/organizerReadQuery";

export default withActionLocale(async function getOrganizerPlaces(options?: {
  // Public profile lookup (e.g. /user/[username]/places): when set, returns
  // that user's places without requiring the viewer to be signed in, same
  // as getUserPosts(username, ...). When omitted, falls back to the
  // original behavior -- the currently authenticated caller's own places
  // (used by /manage/places, which is inherently "my places" and already
  // auth-gated by the page itself, plus the mobile
  // GET /api/mobile/organizer/places route).
  username?: string;
  cursor?: string | null;
  pageSize?: number;
}): Promise<Awaited<ReturnType<typeof fetchOrganizerPlacesPage>>> {
  const supabase = await createClient();

  let ownerId: string;

  if (options?.username) {
    const { data: profile, error: profileError } = await supabase
      .from("user_info")
      .select("id")
      .eq("username", options.username)
      .maybeSingle();

    if (profileError || !profile) {
      return {
        status: 404,
        data: [],
        nextCursor: null,
        hasNextPage: false,
        message: tr("userNotFound"),
      };
    }

    ownerId = profile.id;
  } else {
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

    ownerId = user.id;
  }

  return fetchOrganizerPlacesPage(supabase, ownerId, {
    cursor: options?.cursor,
    pageSize: options?.pageSize,
  });
});
