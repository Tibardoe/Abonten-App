"use server";

import { createClient } from "@/config/supabase/server";
import { deletePlaceDraftCore } from "@/utils/placeDraftCore";

// Cloudinary-first, DB-second ordering (in the core) — a failed Cloudinary
// destroy leaves the draft row in place so the asset can still be found and
// retried. Body shared with POST /api/mobile/organizer/place-drafts/[id]/delete.
export async function deletePlaceDraft(draftId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return { status: 500 as const, message: userError.message };
  }
  if (!user) {
    return { status: 401 as const, message: "User not authenticated" };
  }

  return deletePlaceDraftCore(supabase, user.id, draftId);
}
