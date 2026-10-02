"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { deleteEventDraftCore } from "@abonten/services/events/eventDraftCore";
import { tr } from "@abonten/services/i18n/requestLocale";

// Cloudinary-first, DB-second ordering (in the core) — a failed Cloudinary
// destroy leaves the draft row in place so the asset can still be found and
// retried. Body shared with POST /api/mobile/organizer/event-drafts/[id]/delete.
export const deleteEventDraft = withActionLocale(
  async function deleteEventDraft(draftId: string) {
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

    return deleteEventDraftCore(supabase, user.id, draftId);
  },
);
