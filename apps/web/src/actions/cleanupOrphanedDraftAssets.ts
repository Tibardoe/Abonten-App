"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { drainCloudinaryCleanupQueueCore } from "@abonten/services/platform/cloudinaryCleanupCore";

// Opportunistic extra drain of draft_asset_cleanup_queue when a signed-in
// person opens the Drafts page (expired draft flyers show up there first).
// The real drain is POST /api/maintenance/storage-purge, run by the
// storage-purge-dispatch pg_cron job; the queue is server-only since
// migration 20260916131000, so this uses the same service-role core.
// Best-effort: never fails the page.
export const cleanupOrphanedDraftAssets = withActionLocale(
  async function cleanupOrphanedDraftAssets() {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 401, message: tr("userNotAuthenticated") };

    try {
      const summary = await drainCloudinaryCleanupQueueCore();
      return {
        status: 200,
        message: tr("cleanedUpAssetS", {
          destroyed: summary.destroyed,
        }),
      };
    } catch {
      return { status: 200, message: tr("nothingToCleanUp") };
    }
  },
);
