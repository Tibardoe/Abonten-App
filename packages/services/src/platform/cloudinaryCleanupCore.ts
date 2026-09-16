import { logger } from "@abonten/core/logger";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { v2 as cloudinary } from "cloudinary";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { contentMediaEnvironmentPrefix } from "../uploads/cloudinaryUploadSignature";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Cloudinary asset cleanup (migration 20260916131000). SQL decides what is
// due and queues it in draft_asset_cleanup_queue; only the Cloudinary API
// can destroy an asset, so POST /api/maintenance/storage-purge (poked by the
// storage-purge-dispatch cron) drains the queue here. Once a day it also
// sweeps content_media/<this environment>/ on Cloudinary for uploads that
// were never registered as a content_media row — the person left before
// saving, or registration refused the file — which nothing else would ever
// find. Only this environment's folder: the Cloudinary account is shared
// with other environments whose uploads this database has never seen.
// Service role only; never a Server Action.

const BATCH = 50;
/** An upload younger than this may still be on its way to registration. */
const UNREGISTERED_GRACE_MS = 24 * 60 * 60 * 1000;
const SWEEP_PAGES_PER_TYPE = 4;

type ResourceType = "image" | "video";

export type CloudinaryCleanupDeps = {
  client?: ServiceRoleClient;
  destroy?: (
    publicId: string,
    resourceType: ResourceType,
  ) => Promise<{ result?: string }>;
  listResources?: (options: {
    prefix: string;
    resourceType: ResourceType;
    nextCursor?: string;
  }) => Promise<{
    resources: { public_id: string; created_at: string }[];
    next_cursor?: string;
  }>;
  now?: () => number;
  /** Minimum hours between sweeps (tests pass 0). */
  sweepEveryHours?: number;
};

/** Queue one asset for destruction (idempotent while it is still queued). */
export async function enqueueCloudinaryCleanup(
  supabase: ServiceRoleClient,
  publicId: string,
  resourceType: ResourceType,
): Promise<void> {
  const { error } = await supabase.rpc("cloudinary_cleanup_enqueue", {
    p_public_id: publicId,
    p_resource_type: resourceType,
  });
  if (error) {
    logger.error(
      `cloudinary cleanup enqueue failed for ${publicId}: ${error.message}`,
    );
  }
}

export async function drainCloudinaryCleanupQueueCore(
  deps: CloudinaryCleanupDeps = {},
): Promise<{ claimed: number; destroyed: number; retrying: number }> {
  const supabase = deps.client ?? getSupabaseServiceClient();
  const destroy =
    deps.destroy ??
    ((publicId: string, resourceType: ResourceType) =>
      cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
        invalidate: true,
      }) as Promise<{ result?: string }>);
  const summary = { claimed: 0, destroyed: 0, retrying: 0 };

  const { data: rows, error } = await supabase.rpc("cloudinary_cleanup_claim", {
    p_limit: BATCH,
  });
  if (error) {
    logger.error(`cloudinary cleanup claim failed: ${error.message}`);
    return summary;
  }
  const claimed = (rows ?? []) as {
    cleanup_id: number;
    public_id: string;
    resource_type: string;
  }[];
  summary.claimed = claimed.length;

  const done: number[] = [];
  for (const row of claimed) {
    const type: ResourceType =
      row.resource_type === "video" ? "video" : "image";
    try {
      const res = await destroy(row.public_id, type);
      // "not found" means it is already gone, which is the goal.
      if (res?.result === "ok" || res?.result === "not found") {
        done.push(row.cleanup_id);
      } else {
        summary.retrying += 1;
        await finish(supabase, [row.cleanup_id], "queued", res?.result);
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      logger.error(`cloudinary destroy failed for ${row.public_id}: ${detail}`);
      summary.retrying += 1;
      await finish(supabase, [row.cleanup_id], "queued", detail);
    }
  }
  if (done.length > 0) {
    await finish(supabase, done, "done");
    summary.destroyed = done.length;
  }
  return summary;
}

async function finish(
  supabase: ServiceRoleClient,
  ids: number[],
  status: "done" | "queued",
  detail?: string,
) {
  const { error } = await supabase.rpc("cloudinary_cleanup_finish", {
    p_ids: ids,
    p_status: status,
    p_detail: (detail ?? null) as unknown as string,
  });
  if (error) logger.error(`cloudinary cleanup finish failed: ${error.message}`);
}

/**
 * Finds Spotlight / Story uploads on Cloudinary with no content_media row
 * that are older than a day, and queues them. Runs at most once per 20
 * hours (content_upload_sweep_claim).
 */
export async function sweepUnregisteredContentUploadsCore(
  deps: CloudinaryCleanupDeps = {},
): Promise<{ ran: boolean; scanned: number; queued: number }> {
  const supabase = deps.client ?? getSupabaseServiceClient();
  const now = deps.now ?? Date.now;
  const listResources =
    deps.listResources ??
    (async ({ prefix, resourceType, nextCursor }) =>
      (await cloudinary.api.resources({
        type: "upload",
        prefix,
        resource_type: resourceType,
        max_results: 500,
        ...(nextCursor ? { next_cursor: nextCursor } : {}),
      })) as {
        resources: { public_id: string; created_at: string }[];
        next_cursor?: string;
      });

  const { data: due, error } = await supabase.rpc(
    "content_upload_sweep_claim",
    { p_min_hours: deps.sweepEveryHours ?? 20 },
  );
  if (error) {
    logger.error(`content upload sweep claim failed: ${error.message}`);
    return { ran: false, scanned: 0, queued: 0 };
  }
  if (!due) return { ran: false, scanned: 0, queued: 0 };

  const prefix = contentMediaEnvironmentPrefix();
  let scanned = 0;
  let queued = 0;
  for (const resourceType of ["image", "video"] as const) {
    let cursor: string | undefined;
    for (let page = 0; page < SWEEP_PAGES_PER_TYPE; page += 1) {
      let result: Awaited<
        ReturnType<NonNullable<CloudinaryCleanupDeps["listResources"]>>
      >;
      try {
        result = await listResources({
          prefix,
          resourceType,
          nextCursor: cursor,
        });
      } catch (e) {
        logger.error(
          `content upload sweep: listing ${resourceType} failed: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
        break;
      }
      const old = (result.resources ?? []).filter(
        (r) =>
          r.public_id.startsWith(prefix) &&
          now() - Date.parse(r.created_at) > UNREGISTERED_GRACE_MS,
      );
      scanned += result.resources?.length ?? 0;
      // Chunked: a long id list would not fit in one request URL.
      for (let i = 0; i < old.length; i += 100) {
        const chunk = old.slice(i, i + 100);
        const { data: known, error: knownError } = await supabase
          .from("content_media")
          .select("public_id")
          .in(
            "public_id",
            chunk.map((r) => r.public_id),
          );
        if (knownError) {
          // Never queue anything we couldn't check.
          logger.error(
            `content upload sweep lookup failed: ${knownError.message}`,
          );
          continue;
        }
        const registered = new Set((known ?? []).map((k) => k.public_id));
        for (const r of chunk) {
          if (registered.has(r.public_id)) continue;
          await enqueueCloudinaryCleanup(supabase, r.public_id, resourceType);
          queued += 1;
        }
      }
      cursor = result.next_cursor;
      if (!cursor) break;
    }
  }
  if (queued > 0) {
    logger.warn(
      `content upload sweep queued ${queued} unregistered upload(s) of ${scanned} scanned`,
    );
  }
  return { ran: true, scanned, queued };
}
