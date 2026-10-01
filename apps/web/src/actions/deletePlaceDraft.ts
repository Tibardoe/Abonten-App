"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { deletePlaceDraftCore } from "@abonten/services/places/placeDraftCore";

// Cloudinary-first, DB-second ordering (in the core) — a failed Cloudinary
// destroy leaves the draft row in place so the asset can still be found and
// retried. Body shared with POST /api/mobile/organizer/place-drafts/[id]/delete.
export const deletePlaceDraft = withActionLocale(
  async function deletePlaceDraft(draftId: string) {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      return { status: 500 as const, message: userError.message };
    }
    if (!user) {
      return {
        status: 401 as const,
        message: tr("userNotAuthenticated"),
      };
    }

    return deletePlaceDraftCore(supabase, user.id, draftId);
  },
);
