"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@/utils/logger";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const BATCH_SIZE = 10;

// Drains a small batch of Cloudinary assets queued in
// draft_asset_cleanup_queue — mainly by the cleanup_expired_drafts() cron
// job (see the drafts migrations), but also by uploadHighlight.ts as a
// fallback when a highlight's Cloudinary upload succeeds but the matching DB
// insert fails and the immediate destroy() call itself errors. pg_cron
// can't call Cloudinary directly (no pg_net + Edge Function wired up for
// this yet), so this best-effort sweep is called opportunistically whenever
// any authenticated user loads the Drafts page — cleanup queued from outside
// that flow is therefore eventual, not guaranteed-immediate. Errors are
// swallowed: this is best-effort housekeeping, never something a user action
// should fail because of.
export async function cleanupOrphanedDraftAssets() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: 401, message: "User not authenticated" };

  const { data: queued, error: queueError } = await supabase
    .from("draft_asset_cleanup_queue")
    .select("id, public_id, resource_type")
    .limit(BATCH_SIZE);

  if (queueError || !queued || queued.length === 0) {
    return { status: 200, message: "Nothing to clean up." };
  }

  const processedIds: number[] = [];

  for (const item of queued) {
    try {
      await cloudinary.uploader.destroy(item.public_id, {
        resource_type: item.resource_type as "image" | "video",
      });
      processedIds.push(item.id);
    } catch (cloudError) {
      logger.error("Failed to clean up orphaned draft asset:", cloudError);
    }
  }

  if (processedIds.length > 0) {
    await supabase
      .from("draft_asset_cleanup_queue")
      .delete()
      .in("id", processedIds);
  }

  return {
    status: 200,
    message: `Cleaned up ${processedIds.length} asset(s).`,
  };
}
