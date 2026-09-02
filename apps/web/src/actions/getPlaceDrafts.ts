"use server";

import { createClient } from "@/config/supabase/server";
import { fetchPlaceDraftsList } from "@/utils/placeDraftCore";

export type { PlaceDraftListItem } from "@/utils/placeDraftCore";

// List-page query: only list-display columns, never the full jsonb payload,
// bounded to this user's own non-expired place drafts. Body shared with the
// mobile GET /api/mobile/organizer/place-drafts route. Mirrors getEventDrafts.ts.
export async function getPlaceDrafts() {
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
      message: "User not authenticated",
      data: [],
    };
  }

  const result = await fetchPlaceDraftsList(supabase, user.id);

  if (result.status !== 200) {
    return { status: 500 as const, message: result.message, data: result.data };
  }

  return { status: 200 as const, message: "OK", data: result.data };
}
