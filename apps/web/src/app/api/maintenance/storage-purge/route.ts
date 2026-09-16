import { logger } from "@abonten/core/logger";
import {
  drainCloudinaryCleanupQueueCore,
  sweepUnregisteredContentUploadsCore,
} from "@abonten/services/platform/cloudinaryCleanupCore";
import {
  isStoragePurgeTokenValid,
  purgeQueuedStorageObjectsCore,
} from "@abonten/services/platform/storagePurgeCore";
import { NextResponse } from "next/server";

export const maxDuration = 60;

// POST /api/maintenance/storage-purge
//
// Deletes bucket objects the retention jobs queued in storage_purge_queue
// (claim documents 30 days after a decision, verification evidence past
// its retention, documents of deleted accounts), then destroys the
// Cloudinary assets queued in draft_asset_cleanup_queue and, once a day,
// sweeps never-registered Spotlight / Story uploads. Only the Storage API can
// remove the files -- SQL cannot -- so the `storage-purge-dispatch`
// pg_cron job calls this every 10 minutes while something is queued, with
// the token from storage_purge_config in the `x-purge-token` header. The
// queue hands rows out as 'sending', so an overlapping call never deletes
// or counts an object twice.
export async function POST(req: Request) {
  if (!(await isStoragePurgeTokenValid(req.headers.get("x-purge-token")))) {
    logger.warn(
      "maintenance/storage-purge: rejected -- missing or wrong token",
    );
    return NextResponse.json({ status: 401 }, { status: 401 });
  }

  const res = await purgeQueuedStorageObjectsCore();
  // Cloudinary assets are queued separately (draft_asset_cleanup_queue);
  // a failure there never hides the storage result.
  let cloudinary: unknown = null;
  try {
    cloudinary = {
      queue: await drainCloudinaryCleanupQueueCore(),
      sweep: await sweepUnregisteredContentUploadsCore(),
    };
  } catch (e) {
    logger.error("maintenance/storage-purge: Cloudinary cleanup failed", e);
  }
  return NextResponse.json({ ...res, cloudinary }, { status: res.status });
}
