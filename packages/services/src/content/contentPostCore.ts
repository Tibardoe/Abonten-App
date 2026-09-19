import { collectHashtags } from "@abonten/core/content/hashtags";
import { logger } from "@abonten/core/logger";
import {
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@abonten/core/pagination";
import { cloudinary } from "@abonten/services/media/cloudinaryClient";
import type {
  ContentCampaignStatus,
  ContentKind,
  ContentOwnPost,
  ContentPostDocument,
  ContentPublisher,
  ContentPublisherKind,
} from "@abonten/types/contentType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  CreateContentPostInput,
  UpdateContentPostInput,
} from "@abonten/validation/contentSchemas";
import { hasOpenPaymentAttempt } from "../payments/paymentAttempt";
import { confirmPendingRenditionsCore } from "./contentMediaCore";
import { resolveContentAccess } from "./contentProgram";
import {
  type Envelope,
  FAIL,
  accountIsRestricted,
  loadPostDocument,
  loadPostDocuments,
  loadPublisher,
} from "./contentShared";

// Creating, publishing, editing, deleting and reading posts. Every write is
// service-role after the caller's identity was proven by the transport; the
// database function content_post_publish() is the only thing that moves a
// post to 'published' (it re-checks eligibility, media readiness and the
// right to attach an event or place).

const PAGE = 12;

function sqlError(error: { message: string; code?: string }): Envelope<never> {
  // Messages raised by content_post_publish are user-facing.
  if (error.code === "42501") return { status: 403, message: error.message };
  if (error.code === "22023") return { status: 400, message: error.message };
  if (error.code === "54000") return { status: 429, message: error.message };
  if (error.code === "P0002") return { status: 404, message: error.message };
  logger.error(`content post: ${error.message}`);
  return FAIL;
}

export async function createContentPostCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: CreateContentPostInput,
): Promise<Envelope<ContentPostDocument>> {
  const { program } = await resolveContentAccess(supabase, userId);
  const allowed =
    input.kind === "spotlight"
      ? program.spotlightPosting
      : program.storiesPosting;
  if (!allowed) {
    return {
      status: 403,
      message: "Posting isn't available for your account yet.",
    };
  }
  if (await accountIsRestricted(supabase, userId)) {
    return { status: 403, message: "Your account has been restricted." };
  }
  if (input.kind === "spotlight" && input.mediaIds.length !== 1) {
    return { status: 400, message: "A Spotlight holds one video or photo." };
  }
  if (input.kind === "story" && input.mediaIds.length > program.maxStoryItems) {
    return {
      status: 400,
      message: `A Story holds at most ${program.maxStoryItems} items.`,
    };
  }
  if (
    input.publisher.kind === "place" &&
    !program.publisherPlaces.some((p) => p.id === input.publisher.placeId)
  ) {
    return { status: 403, message: "You can only post as a place you own." };
  }

  // Idempotent create: a retry with the same clientRequestId returns the
  // post the first call made.
  if (input.clientRequestId) {
    const { data: existing } = await supabase
      .from("content_media")
      .select("post_id")
      .in("id", input.mediaIds)
      .not("post_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (existing?.post_id) {
      const doc = await loadPostDocument(supabase, userId, existing.post_id);
      if (doc && doc.authorId === userId) return { status: 200, data: doc };
    }
  }

  // Media must be the caller's own, ready and not attached yet.
  const { data: media, error: mediaError } = await supabase
    .from("content_media")
    .select("id, owner_id, post_id, status, media_type")
    .in("id", input.mediaIds);
  if (mediaError) {
    logger.error(
      `createContentPostCore media read failed: ${mediaError.message}`,
    );
    return FAIL;
  }
  const byId = new Map((media ?? []).map((m) => [m.id, m]));
  for (const id of input.mediaIds) {
    const m = byId.get(id);
    if (!m || m.owner_id !== userId) {
      return { status: 404, message: "Some media could not be found." };
    }
    if (m.post_id) {
      return {
        status: 409,
        message: "Some media already belongs to another post.",
      };
    }
    if (!["uploaded", "processing", "ready"].includes(m.status)) {
      return { status: 400, message: "Some media is not ready yet." };
    }
  }

  const hashtags = collectHashtags(input.caption, input.hashtags);
  const { data: post, error: insertError } = await supabase
    .from("content_post")
    .insert({
      kind: input.kind,
      author_id: userId,
      publisher_kind: input.publisher.kind,
      publisher_place_id:
        input.publisher.kind === "place"
          ? (input.publisher.placeId ?? null)
          : null,
      caption: input.caption?.trim() || null,
      hashtags,
      event_id: input.eventId ?? null,
      place_id: input.placeId ?? null,
      category: input.category ?? null,
      allow_comments: input.allowComments,
      allow_download: input.kind === "spotlight" ? input.allowDownload : false,
      rights_acknowledged_at: new Date().toISOString(),
      status: "draft",
    })
    .select("id")
    .single();
  if (insertError || !post) {
    logger.error(
      `createContentPostCore insert failed: ${insertError?.message}`,
    );
    return FAIL;
  }

  for (let i = 0; i < input.mediaIds.length; i += 1) {
    const { error } = await supabase
      .from("content_media")
      .update({ post_id: post.id, position: i })
      .eq("id", input.mediaIds[i])
      .eq("owner_id", userId)
      .is("post_id", null);
    if (error) {
      logger.error(`createContentPostCore attach failed: ${error.message}`);
      await supabase.from("content_post").delete().eq("id", post.id);
      return FAIL;
    }
  }

  if (input.publish) {
    const published = await publishContentPostCore(supabase, userId, post.id);
    if (published.status !== 200) {
      // Keep the draft so the person can fix what the database refused.
      return { ...published, data: undefined } as Envelope<ContentPostDocument>;
    }
    return published;
  }
  const doc = await loadPostDocument(supabase, userId, post.id);
  return doc ? { status: 200, data: doc } : FAIL;
}

export async function publishContentPostCore(
  supabase: ServiceRoleClient,
  userId: string,
  postId: string,
): Promise<Envelope<ContentPostDocument>> {
  const { error } = await supabase.rpc("content_post_publish", {
    p_post_id: postId,
    p_actor_id: userId,
  });
  if (error) return sqlError(error);
  const doc = await loadPostDocument(supabase, userId, postId);
  return doc ? { status: 200, data: doc } : FAIL;
}

export async function updateContentPostCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: UpdateContentPostInput,
): Promise<Envelope<ContentPostDocument>> {
  const { data: post } = await supabase
    .from("content_post")
    .select("id, author_id, status, kind, caption, hashtags")
    .eq("id", input.postId)
    .maybeSingle();
  if (!post || post.author_id !== userId) {
    return { status: 404, message: "Post not found." };
  }
  if (post.status === "deleted") {
    return { status: 410, message: "This post was deleted." };
  }
  if (await accountIsRestricted(supabase, userId)) {
    return { status: 403, message: "Your account has been restricted." };
  }
  const patch: Record<string, unknown> = {};
  const p = input.patch;
  if (p.caption !== undefined) patch.caption = p.caption?.trim() || null;
  if (p.caption !== undefined || p.hashtags !== undefined) {
    patch.hashtags = collectHashtags(
      p.caption !== undefined ? p.caption : post.caption,
      p.hashtags ?? [],
    );
  }
  if (p.allowComments !== undefined) patch.allow_comments = p.allowComments;
  if (p.allowDownload !== undefined) {
    patch.allow_download = post.kind === "spotlight" ? p.allowDownload : false;
  }
  // Attachments only change on drafts: publish re-validates them.
  if (post.status === "draft") {
    if (p.eventId !== undefined) patch.event_id = p.eventId;
    if (p.placeId !== undefined) patch.place_id = p.placeId;
  } else if (p.eventId !== undefined || p.placeId !== undefined) {
    return {
      status: 400,
      message: "Attachments can't change once a post is published.",
    };
  }
  if (Object.keys(patch).length === 0) {
    const doc = await loadPostDocument(supabase, userId, post.id);
    return doc ? { status: 200, data: doc } : FAIL;
  }
  const { error } = await supabase
    .from("content_post")
    .update(patch as never)
    .eq("id", post.id)
    .eq("author_id", userId);
  if (error) return sqlError(error);
  const doc = await loadPostDocument(supabase, userId, post.id);
  return doc ? { status: 200, data: doc } : FAIL;
}

/** Soft delete: the row and media stay for the retention period. */
export async function deleteContentPostCore(
  supabase: ServiceRoleClient,
  userId: string,
  postId: string,
): Promise<Envelope> {
  const { data: post } = await supabase
    .from("content_post")
    .select("id, author_id, status")
    .eq("id", postId)
    .maybeSingle();
  if (!post || post.author_id !== userId) {
    return { status: 404, message: "Post not found." };
  }
  if (post.status === "deleted") return { status: 200, message: "Deleted." };

  // A live campaign on this post stops now; the advertiser can ask for the
  // unspent remainder from support.
  const { data: campaigns } = await supabase
    .from("content_campaign")
    .select("id, status")
    .eq("post_id", postId)
    .in("status", ["pending_review", "scheduled", "active", "paused"]);
  for (const c of campaigns ?? []) {
    await supabase.rpc("content_campaign_transition", {
      p_campaign_id: c.id,
      p_to: "cancelled",
      p_actor_id: userId,
      p_actor_kind: "advertiser",
      p_reason: "Spotlight deleted by its author",
    });
  }

  // An unpaid order for this post is cancelled too, unless a payment is in
  // flight: cancelling then could strand a real charge, so that one is left
  // to finish and reaches review, where staff reject it with a full refund.
  const { data: unpaid } = await supabase
    .from("content_campaign")
    .select("id, checkout_id")
    .eq("post_id", postId)
    .in("status", ["draft", "pending_payment"]);
  for (const c of unpaid ?? []) {
    if (
      c.checkout_id &&
      (await hasOpenPaymentAttempt(
        supabase,
        "content_campaign_checkout_id",
        c.checkout_id,
      ))
    ) {
      continue;
    }
    if (c.checkout_id) {
      await supabase
        .from("content_campaign_checkout")
        .update({ status: "cancelled" })
        .eq("id", c.checkout_id)
        .eq("status", "pending");
    }
    await supabase.rpc("content_campaign_transition", {
      p_campaign_id: c.id,
      p_to: "cancelled",
      p_actor_id: userId,
      p_actor_kind: "advertiser",
      p_reason: "Spotlight deleted before payment",
    });
  }

  const { error } = await supabase
    .from("content_post")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("author_id", userId);
  if (error) return sqlError(error);
  return { status: 200, message: "Deleted." };
}

export type GetContentPostResult =
  | { status: 200; data: { post: ContentPostDocument } }
  | {
      status: 410;
      message: string;
      data: { expired: true; publisher: ContentPublisher | null };
    }
  | { status: 403 | 404 | 500; message: string };

/**
 * One post by id for a viewer (deep links, the viewer, the manage screen).
 * An expired Story answers 410 with its publisher so the link can fall back
 * to the profile or place.
 */
export async function getContentPostCore(
  supabase: ServiceRoleClient,
  userId: string | null,
  postId: string,
): Promise<GetContentPostResult> {
  const { data: row } = await supabase
    .from("content_post")
    .select(
      "id, kind, author_id, publisher_kind, publisher_place_id, status, expires_at",
    )
    .eq("id", postId)
    .maybeSingle();
  if (!row || row.status === "deleted") {
    return { status: 404, message: "This post is no longer available." };
  }
  const { program } = await resolveContentAccess(supabase, userId);
  const isAuthor = userId === row.author_id;
  if (
    !isAuthor &&
    !(row.kind === "story" ? program.stories : program.spotlight)
  ) {
    return { status: 403, message: "Not available yet." };
  }
  if (
    row.kind === "story" &&
    !isAuthor &&
    (row.status !== "published" ||
      !row.expires_at ||
      Date.parse(row.expires_at) <= Date.now())
  ) {
    const publisher = await loadPublisher(
      supabase,
      row.publisher_kind as ContentPublisherKind,
      row.publisher_kind === "place"
        ? (row.publisher_place_id as string)
        : row.author_id,
    );
    return {
      status: 410,
      message: "This Story has ended.",
      data: { expired: true, publisher },
    };
  }
  const doc = await loadPostDocument(supabase, userId, postId);
  if (!doc)
    return { status: 404, message: "This post is no longer available." };
  void confirmPendingRenditionsCore(
    supabase,
    doc.media.filter((m) => m.playbackStatus === "pending").map((m) => m.id),
  );
  return { status: 200, data: { post: doc } };
}

type PublisherCursor = { publishedAt: string; id: string };

/** Public posts by one publisher (profile / place page tab). */
export async function listPublisherPostsCore(
  supabase: ServiceRoleClient,
  userId: string | null,
  input: {
    publisherKind: "organizer" | "place";
    publisherId: string;
    kind: ContentKind;
    cursor?: string | null;
  },
): Promise<
  Envelope<{
    posts: ContentPostDocument[];
    nextCursor: string | null;
    hasNextPage: boolean;
  }>
> {
  const { program } = await resolveContentAccess(supabase, userId);
  if (!(input.kind === "story" ? program.stories : program.spotlight)) {
    return {
      status: 200,
      data: { posts: [], nextCursor: null, hasNextPage: false },
    };
  }
  const cursor = decodeCursor<PublisherCursor>(input.cursor);
  let query = supabase
    .from("content_post")
    .select("id, published_at")
    .eq("kind", input.kind)
    .eq("status", "published")
    .in("moderation_state", ["visible", "restricted"])
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE + 1);
  if (input.kind === "story")
    query = query.gt("expires_at", new Date().toISOString());
  query =
    input.publisherKind === "place"
      ? query.eq("publisher_place_id", input.publisherId)
      : query.eq("author_id", input.publisherId).neq("publisher_kind", "place");
  if (cursor) {
    query = query.or(
      `published_at.lt.${cursor.publishedAt},and(published_at.eq.${cursor.publishedAt},id.lt.${cursor.id})`,
    );
  }
  const { data, error } = await query;
  if (error) {
    logger.error(`listPublisherPostsCore failed: ${error.message}`);
    return FAIL;
  }
  const { page, hasNextPage } = splitPage(data ?? [], PAGE);
  const posts = await loadPostDocuments(
    supabase,
    userId,
    page.map((r) => r.id),
  );
  const last = page[page.length - 1];
  return {
    status: 200,
    data: {
      posts,
      hasNextPage,
      nextCursor:
        hasNextPage && last
          ? encodeCursor<PublisherCursor>({
              publishedAt: last.published_at as string,
              id: last.id,
            })
          : null,
    },
  };
}

/** The creator's own posts, every state, with the campaign if any. */
export async function listOwnContentPostsCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: {
    kind?: ContentKind;
    status?: "published" | "draft";
    cursor?: string | null;
  },
): Promise<
  Envelope<{
    posts: ContentOwnPost[];
    nextCursor: string | null;
    hasNextPage: boolean;
  }>
> {
  const cursor = decodeCursor<{ createdAt: string; id: string }>(input.cursor);
  let query = supabase
    .from("content_post")
    .select(
      "id, kind, status, moderation_state, caption, published_at, expires_at, created_at, publisher_kind, publisher_place_id, event_id, place_id, like_count, reaction_count, comment_count, share_count, save_count, view_count, content_media!content_media_post_id_fkey(media_url, thumbnail_url, media_type, position, status), content_campaign(id, status, created_at)",
    )
    .eq("author_id", userId)
    .neq("status", "deleted")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE + 1);
  if (input.kind) query = query.eq("kind", input.kind);
  if (input.status) query = query.eq("status", input.status);
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }
  const { data, error } = await query;
  if (error) {
    logger.error(`listOwnContentPostsCore failed: ${error.message}`);
    return FAIL;
  }
  const { page, hasNextPage } = splitPage(data ?? [], PAGE);
  const posts: ContentOwnPost[] = page.map((r) => {
    const media = (r.content_media ?? [])
      .filter((m) => m.status !== "deleted")
      .sort((a, b) => a.position - b.position);
    const campaigns = (r.content_campaign ?? []).sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
    return {
      id: r.id,
      kind: r.kind as ContentKind,
      status: r.status as ContentOwnPost["status"],
      moderationState: r.moderation_state as ContentOwnPost["moderationState"],
      caption: r.caption,
      publishedAt: r.published_at,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      cover: media[0]
        ? {
            thumbnailUrl: media[0].thumbnail_url,
            mediaUrl: media[0].media_url,
            type: media[0].media_type as "image" | "video",
          }
        : null,
      counts: {
        likes: r.like_count,
        reactions: r.reaction_count,
        comments: r.comment_count,
        shares: r.share_count,
        saves: r.save_count,
        views: r.view_count,
      },
      publisher: {
        kind: r.publisher_kind as ContentPublisherKind,
        placeId: r.publisher_place_id,
      },
      eventId: r.event_id,
      placeId: r.place_id,
      campaign: campaigns[0]
        ? {
            id: campaigns[0].id,
            status: campaigns[0].status as ContentCampaignStatus,
          }
        : null,
    };
  });
  const last = page[page.length - 1];
  return {
    status: 200,
    data: {
      posts,
      hasNextPage,
      nextCursor:
        hasNextPage && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    },
  };
}

/** A signed-off download of one Spotlight video (owner-permitted only). */
export async function getContentDownloadUrlCore(
  supabase: ServiceRoleClient,
  userId: string | null,
  postId: string,
): Promise<Envelope<{ url: string }>> {
  const { program } = await resolveContentAccess(supabase, userId);
  const { data: post } = await supabase
    .from("content_post")
    .select(
      "id, kind, author_id, allow_download, status, moderation_state, content_media!content_media_post_id_fkey(public_id, media_type, status, position)",
    )
    .eq("id", postId)
    .maybeSingle();
  if (
    !post ||
    post.status !== "published" ||
    post.moderation_state !== "visible"
  ) {
    return { status: 404, message: "This post is no longer available." };
  }
  const isAuthor = userId === post.author_id;
  if (
    !isAuthor &&
    (!program.spotlightDownloads ||
      !post.allow_download ||
      post.kind !== "spotlight")
  ) {
    return { status: 403, message: "Downloads aren't allowed for this post." };
  }
  const media = (post.content_media ?? [])
    .filter((m) => m.status !== "deleted")
    .sort((a, b) => a.position - b.position)[0];
  if (!media) return { status: 404, message: "No media to download." };
  const url = cloudinary.url(media.public_id, {
    resource_type: media.media_type as "image" | "video",
    secure: true,
    flags: "attachment",
    sign_url: true,
  });
  return { status: 200, data: { url } };
}
