"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { fetchPlaceDraftsList } from "@abonten/services/places/placeDraftCore";

export type { PlaceDraftListItem } from "@abonten/services/places/placeDraftCore";

// List-page query: only list-display columns, never the full jsonb payload,
// bounded to this user's own non-expired place drafts. Body shared with the
// mobile GET /api/mobile/organizer/place-drafts route. Mirrors getEventDrafts.ts.
export const getPlaceDrafts = withActionLocale(async function getPlaceDrafts() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return { status: 500 as const, message: userError.message, data: [] };
  }
  if (!user) {
    return {
      status: 401 as const,
      message: tr("userNotAuthenticated"),
      data: [],
    };
  }

  const result = await fetchPlaceDraftsList(supabase, user.id);

  if (result.status !== 200) {
    return { status: 500 as const, message: result.message, data: result.data };
  }

  return { status: 200 as const, message: "OK", data: result.data };
});
