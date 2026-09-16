import { logger } from "@abonten/core/logger";
import type {
  ContentClickKind,
  ContentInsights,
} from "@abonten/types/contentType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { ContentViewBatchInput } from "@abonten/validation/contentSchemas";
import { checkRateLimit } from "../security/rateLimit";
import { hashViewerKey } from "./contentFeedCore";
import { resolveContentAccess } from "./contentProgram";
import { type Envelope, FAIL } from "./contentShared";

// View and click telemetry. The client batches what its players observed;
// the database validates every event (dedupe windows, watch-time floor,
// self-views, per-device rate) and only valid rows move counters or campaign
// numbers. The device key is hashed before it reaches the database.

export async function ingestContentViewsCore(
  supabase: ServiceRoleClient,
  userId: string | null,
  input: ContentViewBatchInput,
  context: { ip: string },
): Promise<Envelope<{ accepted: number; invalid: number }>> {
  const { program } = await resolveContentAccess(supabase, userId);
  if (!program.spotlight && !program.stories) {
    return { status: 200, data: { accepted: 0, invalid: input.events.length } };
  }
  const viewerKey = hashViewerKey(input.viewerKey, `ip:${context.ip}`);
  if (!(await checkRateLimit(`content-views:${viewerKey}`, 20, 60))) {
    return { status: 429, message: "Too many requests." };
  }
  const { data, error } = await supabase.rpc("content_view_ingest", {
    p_viewer: userId as unknown as string,
    p_viewer_key: viewerKey,
    p_events: input.events.map((e) => ({
      postId: e.postId,
      kind: e.kind,
      watchedMs: e.watchedMs,
      surface: e.surface,
      campaignId: e.campaignId ?? null,
    })),
  });
  if (error) {
    logger.error(`content_view_ingest failed: ${error.message}`);
    return FAIL;
  }
  const result = (data ?? {}) as { accepted?: number; invalid?: number };
  return {
    status: 200,
    data: { accepted: result.accepted ?? 0, invalid: result.invalid ?? 0 },
  };
}

export async function recordContentClickCore(
  supabase: ServiceRoleClient,
  userId: string | null,
  input: {
    viewerKey: string;
    postId: string;
    kind: ContentClickKind;
    campaignId?: string | null;
  },
  context: { ip: string },
): Promise<Envelope<{ accepted: boolean }>> {
  const viewerKey = hashViewerKey(input.viewerKey, `ip:${context.ip}`);
  if (!(await checkRateLimit(`content-clicks:${viewerKey}`, 120, 60))) {
    return { status: 429, message: "Too many requests." };
  }
  const { data, error } = await supabase.rpc("content_click_ingest", {
    p_viewer: userId as unknown as string,
    p_viewer_key: viewerKey,
    p_post_id: input.postId,
    p_kind: input.kind,
    p_campaign: (input.campaignId ?? null) as unknown as string,
  });
  if (error) {
    logger.error(`content_click_ingest failed: ${error.message}`);
    return FAIL;
  }
  const result = (data ?? {}) as { accepted?: boolean };
  return { status: 200, data: { accepted: result.accepted === true } };
}

/** The owner's analytics for one post. */
export async function getContentInsightsCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { postId: string; days?: number },
): Promise<Envelope<ContentInsights>> {
  const { data: post } = await supabase
    .from("content_post")
    .select("id, author_id")
    .eq("id", input.postId)
    .maybeSingle();
  if (!post || post.author_id !== userId) {
    return { status: 404, message: "Post not found." };
  }
  const { data, error } = await supabase.rpc("content_post_insights", {
    p_post_id: input.postId,
    p_days: input.days ?? 30,
  });
  if (error) {
    logger.error(`content_post_insights failed: ${error.message}`);
    return FAIL;
  }
  return { status: 200, data: data as unknown as ContentInsights };
}
