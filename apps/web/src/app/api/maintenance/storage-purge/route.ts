import { logger } from "@abonten/core/logger";
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
// its retention, documents of deleted accounts). Only the Storage API can
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
  return NextResponse.json(res, { status: res.status });
}
