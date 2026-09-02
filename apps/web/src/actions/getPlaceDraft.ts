"use server";

import { createClient } from "@/config/supabase/server";
import { fetchPlaceDraftDetail } from "@/utils/placeDraftCore";

export type { PlaceDraftDetail } from "@/utils/placeDraftCore";

// Full-payload fetch, used only when the owner chooses "Continue" on a
// specific draft. Ownership and expiry are re-checked in the core. Body
// shared with GET /api/mobile/organizer/place-drafts/[draftId]. Mirrors
// getEventDraft.ts.
export async function getPlaceDraft(draftId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return { status: 500 as const, message: userError.message, data: null };
  }
  if (!user) {
    return {
      status: 401 as const,
      message: "User not authenticated",
      data: null,
    };
  }

  const result = await fetchPlaceDraftDetail(supabase, user.id, draftId);

  if (result.status !== 200) {
    return { status: result.status, message: result.message, data: null };
  }

  return { status: 200 as const, message: "OK", data: result.data };
}
