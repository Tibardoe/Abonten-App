import { timingSafeEqual } from "node:crypto";
import { logger } from "@abonten/core/logger";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

// Drains storage_purge_queue (migration 20260913200000_storage_purge_queue):
// the retention SQL functions decide which bucket objects are due and
// enqueue them; only the Storage API can actually remove the files, so the
// `storage-purge-dispatch` pg_cron job pokes POST /api/maintenance/storage-purge
// and that route runs this. The database hands out rows as 'sending', so a
// repeated or overlapping call never deletes (or counts) an object twice.
// Not a "use server" file; service role only.

const BATCH = 200;

export type StoragePurgeSummary = {
  claimed: number;
  deleted: number;
  retrying: number;
  failed: number;
};

type ClaimedRow = { purge_id: number; bucket_id: string; object_path: string };

/** Compares the caller's token with the one the cron job sends. */
export async function isStoragePurgeTokenValid(
  token: string | null,
): Promise<boolean> {
  if (!token) return false;
  const { data, error } = await getSupabaseServiceClient()
    .from("storage_purge_config")
    .select("token")
    .eq("id", true)
    .maybeSingle();
  if (error || !data?.token) {
    if (error)
      logger.error(`storage purge token read failed: ${error.message}`);
    return false;
  }
  const expected = Buffer.from(data.token);
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export type StoragePurgeDeps = {
  /** Defaults to the service-role Storage API. Returns nothing on success. */
  removeObjects?: (
    bucket: string,
    paths: string[],
  ) => Promise<{ error: string | null }>;
  client?: ServiceRoleClient;
};

export async function purgeQueuedStorageObjectsCore(
  deps: StoragePurgeDeps = {},
): Promise<{ status: 200 | 500; summary: StoragePurgeSummary }> {
  const supabase = deps.client ?? getSupabaseServiceClient();
  const removeObjects =
    deps.removeObjects ??
    (async (bucket: string, paths: string[]) => {
      const { error } = await supabase.storage.from(bucket).remove(paths);
      return { error: error ? error.message : null };
    });

  const summary: StoragePurgeSummary = {
    claimed: 0,
    deleted: 0,
    retrying: 0,
    failed: 0,
  };

  const { data: rows, error: claimError } = await supabase.rpc(
    "storage_purge_claim",
    { p_limit: BATCH },
  );
  if (claimError) {
    logger.error(`storage purge claim failed: ${claimError.message}`);
    return { status: 500, summary };
  }
  const claimed = (rows ?? []) as ClaimedRow[];
  summary.claimed = claimed.length;
  if (claimed.length === 0) return { status: 200, summary };

  // The Storage API removes many paths of one bucket in one call. A path
  // that no longer exists is not an error there, which is the outcome we
  // want anyway.
  const byBucket = new Map<string, ClaimedRow[]>();
  for (const row of claimed) {
    const list = byBucket.get(row.bucket_id) ?? [];
    list.push(row);
    byBucket.set(row.bucket_id, list);
  }

  const finish = async (ids: number[], status: string, detail?: string) => {
    if (ids.length === 0) return;
    const { error } = await supabase.rpc("storage_purge_finish", {
      p_ids: ids,
      p_status: status,
      p_detail: detail ?? undefined,
    });
    if (error) logger.error(`storage purge finish failed: ${error.message}`);
  };

  for (const [bucket, list] of byBucket) {
    const ids = list.map((r) => r.purge_id);
    try {
      const { error } = await removeObjects(
        bucket,
        list.map((r) => r.object_path),
      );
      if (error) {
        logger.error(`storage purge: ${bucket} remove failed: ${error}`);
        summary.retrying += ids.length;
        await finish(ids, "queued", error);
        continue;
      }
      summary.deleted += ids.length;
      await finish(ids, "done");
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      logger.error(`storage purge: ${bucket} threw: ${detail}`);
      summary.retrying += ids.length;
      await finish(ids, "queued", detail);
    }
  }

  return { status: 200, summary };
}
