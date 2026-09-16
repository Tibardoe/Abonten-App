import { logger } from "@abonten/core/logger";
import {
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@abonten/core/pagination";
import type {
  ContentComment,
  ContentCommentsPage,
  ContentCounts,
  ContentReactionEmoji,
  ContentShareChannel,
} from "@abonten/types/contentType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { checkRateLimit } from "../security/rateLimit";
import {
  notifyContentComment,
  notifyContentLike,
  notifyContentReaction,
} from "./contentNotifyCore";
import { readContentSettings, resolveContentAccess } from "./contentProgram";
import {
  type Envelope,
  FAIL,
  accountIsRestricted,
  usersBlocked,
} from "./contentShared";

// Likes, reactions, saves, shares, "not interested" and comments. Every
// operation is idempotent (primary keys + on-conflict), re-checks that the
// post is live and that neither side blocked the other, and honours the
// programme switches (comments / reactions can be turned off centrally).

const COMMENT_PAGE = 20;

type PostRow = {
  id: string;
  kind: "spotlight" | "story";
  author_id: string;
  status: string;
  moderation_state: string;
  published_at: string | null;
  expires_at: string | null;
  allow_comments: boolean;
};

async function livePost(
  supabase: ServiceRoleClient,
  postId: string,
): Promise<PostRow | null> {
  const { data } = await supabase
    .from("content_post")
    .select(
      "id, kind, author_id, status, moderation_state, published_at, expires_at, allow_comments",
    )
    .eq("id", postId)
    .maybeSingle();
  if (!data) return null;
  const row = data as PostRow;
  if (row.status !== "published") return null;
  if (!["visible", "restricted"].includes(row.moderation_state)) return null;
  if (
    row.kind === "story" &&
    (!row.expires_at || Date.parse(row.expires_at) <= Date.now())
  ) {
    return null;
  }
  return row;
}

async function guard(
  supabase: ServiceRoleClient,
  userId: string,
  postId: string,
): Promise<{ post: PostRow } | Envelope<never>> {
  if (await accountIsRestricted(supabase, userId)) {
    return { status: 403, message: "Your account has been restricted." };
  }
  const post = await livePost(supabase, postId);
  if (!post)
    return { status: 404, message: "This post is no longer available." };
  const { program } = await resolveContentAccess(supabase, userId);
  if (!(post.kind === "story" ? program.stories : program.spotlight)) {
    return { status: 403, message: "Not available yet." };
  }
  if (await usersBlocked(supabase, userId, post.author_id)) {
    return { status: 403, message: "You can't interact with this post." };
  }
  return { post };
}

async function counts(
  supabase: ServiceRoleClient,
  postId: string,
): Promise<ContentCounts> {
  const { data } = await supabase
    .from("content_post")
    .select(
      "like_count, reaction_count, comment_count, share_count, save_count, view_count",
    )
    .eq("id", postId)
    .maybeSingle();
  return {
    likes: data?.like_count ?? 0,
    reactions: data?.reaction_count ?? 0,
    comments: data?.comment_count ?? 0,
    shares: data?.share_count ?? 0,
    saves: data?.save_count ?? 0,
    views: data?.view_count ?? 0,
  };
}

export async function setContentLikeCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { postId: string; liked: boolean },
): Promise<Envelope<{ liked: boolean; counts: ContentCounts }>> {
  const g = await guard(supabase, userId, input.postId);
  if (!("post" in g)) return g;
  if (!(await checkRateLimit(`content-like:${userId}`, 300, 3600))) {
    return { status: 429, message: "Slow down a little." };
  }
  if (input.liked) {
    const { error } = await supabase
      .from("content_like")
      .insert({ post_id: input.postId, user_id: userId });
    if (error && error.code !== "23505") {
      logger.error(`like failed: ${error.message}`);
      return FAIL;
    }
    if (!error) {
      await notifyContentLike(
        supabase,
        { id: g.post.id, kind: g.post.kind, authorId: g.post.author_id },
        userId,
      );
    }
  } else {
    const { error } = await supabase
      .from("content_like")
      .delete()
      .eq("post_id", input.postId)
      .eq("user_id", userId);
    if (error) {
      logger.error(`unlike failed: ${error.message}`);
      return FAIL;
    }
  }
  return {
    status: 200,
    data: { liked: input.liked, counts: await counts(supabase, input.postId) },
  };
}

export async function setContentSaveCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { postId: string; saved: boolean },
): Promise<Envelope<{ saved: boolean; counts: ContentCounts }>> {
  const g = await guard(supabase, userId, input.postId);
  if (!("post" in g)) return g;
  if (input.saved) {
    const { error } = await supabase
      .from("content_save")
      .insert({ post_id: input.postId, user_id: userId });
    if (error && error.code !== "23505") {
      logger.error(`save failed: ${error.message}`);
      return FAIL;
    }
  } else {
    const { error } = await supabase
      .from("content_save")
      .delete()
      .eq("post_id", input.postId)
      .eq("user_id", userId);
    if (error) {
      logger.error(`unsave failed: ${error.message}`);
      return FAIL;
    }
  }
  return {
    status: 200,
    data: { saved: input.saved, counts: await counts(supabase, input.postId) },
  };
}

/** One reaction per person per Story: switch replaces, null removes. */
export async function setContentReactionCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { postId: string; emoji: ContentReactionEmoji | null },
): Promise<
  Envelope<{ reaction: ContentReactionEmoji | null; counts: ContentCounts }>
> {
  const g = await guard(supabase, userId, input.postId);
  if (!("post" in g)) return g;
  const { program } = await resolveContentAccess(supabase, userId);
  if (g.post.kind === "story" && !program.storiesReactions) {
    return { status: 403, message: "Reactions are turned off right now." };
  }
  if (!(await checkRateLimit(`content-react:${userId}`, 300, 3600))) {
    return { status: 429, message: "Slow down a little." };
  }
  if (input.emoji === null) {
    const { error } = await supabase
      .from("content_reaction")
      .delete()
      .eq("post_id", input.postId)
      .eq("user_id", userId);
    if (error) {
      logger.error(`unreact failed: ${error.message}`);
      return FAIL;
    }
  } else {
    const { data: existing } = await supabase
      .from("content_reaction")
      .select("emoji")
      .eq("post_id", input.postId)
      .eq("user_id", userId)
      .maybeSingle();
    const { error } = await supabase.from("content_reaction").upsert(
      {
        post_id: input.postId,
        user_id: userId,
        emoji: input.emoji,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "post_id,user_id" },
    );
    if (error) {
      logger.error(`react failed: ${error.message}`);
      return FAIL;
    }
    if (!existing) {
      await notifyContentReaction(
        supabase,
        { id: g.post.id, kind: g.post.kind, authorId: g.post.author_id },
        userId,
        input.emoji,
      );
    }
  }
  return {
    status: 200,
    data: {
      reaction: input.emoji,
      counts: await counts(supabase, input.postId),
    },
  };
}

export async function recordContentShareCore(
  supabase: ServiceRoleClient,
  userId: string | null,
  input: { postId: string; channel: ContentShareChannel },
  context: { ip?: string | null } = {},
): Promise<Envelope<{ counts: ContentCounts }>> {
  const post = await livePost(supabase, input.postId);
  if (!post)
    return { status: 404, message: "This post is no longer available." };
  const { program } = await resolveContentAccess(supabase, userId);
  if (post.kind === "story" && !program.storiesSharing) {
    return { status: 403, message: "Sharing is turned off right now." };
  }
  const { program: shareProgram } = await resolveContentAccess(
    supabase,
    userId,
  );
  if (
    !(post.kind === "story" ? shareProgram.stories : shareProgram.spotlight)
  ) {
    return { status: 403, message: "Not available yet." };
  }
  // Signed-out shares are limited per network address as well as per post,
  // so share counts (which feed Trending) can't be pumped from one place.
  const key = userId
    ? `content-share:${userId}`
    : `content-share:anon:${context.ip ?? "unknown"}:${input.postId}`;
  if (!(await checkRateLimit(key, userId ? 60 : 10, 3600))) {
    return { status: 429, message: "Slow down a little." };
  }
  const { error } = await supabase
    .from("content_share")
    .insert({ post_id: input.postId, user_id: userId, channel: input.channel });
  if (error) {
    logger.error(`share failed: ${error.message}`);
    return FAIL;
  }
  return {
    status: 200,
    data: { counts: await counts(supabase, input.postId) },
  };
}

export async function setNotInterestedCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { postId: string; notInterested: boolean },
): Promise<Envelope<{ notInterested: boolean }>> {
  if (input.notInterested) {
    const { error } = await supabase
      .from("content_not_interested")
      .upsert(
        { user_id: userId, post_id: input.postId },
        { onConflict: "user_id,post_id" },
      );
    if (error) {
      logger.error(`not-interested failed: ${error.message}`);
      return FAIL;
    }
  } else {
    await supabase
      .from("content_not_interested")
      .delete()
      .eq("user_id", userId)
      .eq("post_id", input.postId);
  }
  return { status: 200, data: { notInterested: input.notInterested } };
}

// ── Comments ─────────────────────────────────────────────────────────

type CommentRow = {
  id: string;
  post_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  like_count: number;
  reply_count: number;
  author_id: string;
  status: string;
  moderation_state: string;
};

async function mapComments(
  supabase: ServiceRoleClient,
  viewerId: string | null,
  postAuthorId: string,
  rows: CommentRow[],
): Promise<ContentComment[]> {
  if (rows.length === 0) return [];
  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const [authors, likes] = await Promise.all([
    supabase
      .from("user_info")
      .select("id, username, full_name, avatar_public_id, avatar_version")
      .in("id", authorIds),
    viewerId
      ? supabase
          .from("content_comment_like")
          .select("comment_id")
          .eq("user_id", viewerId)
          .in(
            "comment_id",
            rows.map((r) => r.id),
          )
      : Promise.resolve({ data: [] as { comment_id: string }[] }),
  ]);
  const authorMap = new Map((authors.data ?? []).map((a) => [a.id, a]));
  const liked = new Set((likes.data ?? []).map((l) => l.comment_id));
  return rows.map((r) => {
    const a = authorMap.get(r.author_id);
    return {
      id: r.id,
      postId: r.post_id,
      parentId: r.parent_id,
      body: r.body,
      createdAt: r.created_at,
      likeCount: r.like_count,
      replyCount: r.reply_count,
      author: {
        id: r.author_id,
        username: (a?.username as string | null) ?? null,
        fullName: a?.full_name ?? null,
        avatarPublicId: a?.avatar_public_id ?? null,
        avatarVersion: a?.avatar_version ?? null,
      },
      likedByMe: liked.has(r.id),
      isMine: viewerId === r.author_id,
      canModerate: viewerId === postAuthorId,
    };
  });
}

export async function listContentCommentsCore(
  supabase: ServiceRoleClient,
  userId: string | null,
  input: { postId: string; parentId?: string | null; cursor?: string | null },
): Promise<Envelope<ContentCommentsPage>> {
  const post = await livePost(supabase, input.postId);
  if (!post)
    return { status: 404, message: "This post is no longer available." };
  const { program } = await resolveContentAccess(supabase, userId);
  if (!(post.kind === "story" ? program.stories : program.spotlight)) {
    return { status: 403, message: "Not available yet." };
  }
  if (userId && (await usersBlocked(supabase, userId, post.author_id))) {
    return { status: 404, message: "This post is no longer available." };
  }
  const cursor = decodeCursor<{ createdAt: string; id: string }>(input.cursor);
  let query = supabase
    .from("content_comment")
    .select(
      "id, post_id, parent_id, body, created_at, like_count, reply_count, author_id, status, moderation_state",
    )
    .eq("post_id", input.postId)
    .eq("status", "visible")
    .in("moderation_state", ["visible", "restricted"])
    .limit(COMMENT_PAGE + 1);
  if (input.parentId) {
    query = query
      .eq("parent_id", input.parentId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (cursor) {
      query = query.or(
        `created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`,
      );
    }
  } else {
    query = query
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      );
    }
  }
  const { data, error } = await query;
  if (error) {
    logger.error(`listContentCommentsCore failed: ${error.message}`);
    return FAIL;
  }
  const { page, hasNextPage } = splitPage(
    (data ?? []) as CommentRow[],
    COMMENT_PAGE,
  );
  // Comments from people the viewer blocked (or who blocked the viewer)
  // are dropped here rather than in SQL: they are rare and the block table
  // is small.
  let visible = page;
  if (userId) {
    const checks = await Promise.all(
      page.map((r) =>
        r.author_id === userId
          ? false
          : usersBlocked(supabase, userId, r.author_id),
      ),
    );
    visible = page.filter((_, i) => !checks[i]);
  }
  const comments = await mapComments(supabase, userId, post.author_id, visible);
  const last = page[page.length - 1];
  return {
    status: 200,
    data: {
      comments,
      hasNextPage,
      nextCursor:
        hasNextPage && last
          ? encodeCursor({ createdAt: last.created_at, id: last.id })
          : null,
    },
  };
}

export async function createContentCommentCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { postId: string; parentId?: string | null; body: string },
): Promise<Envelope<ContentComment>> {
  const g = await guard(supabase, userId, input.postId);
  if (!("post" in g)) return g;
  const { program } = await resolveContentAccess(supabase, userId);
  if (
    g.post.kind === "story"
      ? !program.storiesComments
      : !program.spotlightComments
  ) {
    return { status: 403, message: "Comments are turned off right now." };
  }
  if (!g.post.allow_comments) {
    return { status: 403, message: "Comments are off for this post." };
  }
  const settings = await readContentSettings(supabase);
  if (
    !(await checkRateLimit(
      `content-comment:${userId}`,
      settings?.comments_per_hour ?? 60,
      3600,
    ))
  ) {
    return {
      status: 429,
      message: "You're commenting very fast. Please wait a moment.",
    };
  }
  let parentAuthorId: string | null = null;
  if (input.parentId) {
    const { data: parent } = await supabase
      .from("content_comment")
      .select("id, post_id, parent_id, author_id, status")
      .eq("id", input.parentId)
      .maybeSingle();
    if (
      !parent ||
      parent.post_id !== input.postId ||
      parent.status !== "visible"
    ) {
      return { status: 404, message: "That comment is no longer available." };
    }
    if (parent.parent_id) {
      return { status: 400, message: "Replies can't be nested further." };
    }
    parentAuthorId = parent.author_id;
  }
  const { data: inserted, error } = await supabase
    .from("content_comment")
    .insert({
      post_id: input.postId,
      author_id: userId,
      parent_id: input.parentId ?? null,
      body: input.body.trim(),
    })
    .select(
      "id, post_id, parent_id, body, created_at, like_count, reply_count, author_id, status, moderation_state",
    )
    .single();
  if (error || !inserted) {
    logger.error(`createContentCommentCore failed: ${error?.message}`);
    return FAIL;
  }
  await notifyContentComment(
    supabase,
    { id: g.post.id, kind: g.post.kind, authorId: g.post.author_id },
    { id: inserted.id, body: inserted.body, parentAuthorId },
    userId,
  );
  const [comment] = await mapComments(supabase, userId, g.post.author_id, [
    inserted as CommentRow,
  ]);
  return { status: 200, data: comment };
}

/** The comment's author, or the post's author, removes a comment. */
export async function deleteContentCommentCore(
  supabase: ServiceRoleClient,
  userId: string,
  commentId: string,
): Promise<Envelope> {
  const { data: comment } = await supabase
    .from("content_comment")
    .select("id, author_id, post_id, status, content_post!inner(author_id)")
    .eq("id", commentId)
    .maybeSingle();
  if (!comment) return { status: 404, message: "Comment not found." };
  const postAuthor = (
    comment.content_post as unknown as { author_id: string } | null
  )?.author_id;
  if (comment.author_id !== userId && postAuthor !== userId) {
    return { status: 403, message: "You can't remove this comment." };
  }
  if (comment.status === "deleted") return { status: 200, message: "Removed." };
  const { error } = await supabase
    .from("content_comment")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("id", commentId);
  if (error) {
    logger.error(`deleteContentCommentCore failed: ${error.message}`);
    return FAIL;
  }
  return { status: 200, message: "Removed." };
}

export async function setContentCommentLikeCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { commentId: string; liked: boolean },
): Promise<Envelope<{ liked: boolean; likeCount: number }>> {
  if (await accountIsRestricted(supabase, userId)) {
    return { status: 403, message: "Your account has been restricted." };
  }
  const { data: comment } = await supabase
    .from("content_comment")
    .select("id, status, moderation_state, author_id, post_id")
    .eq("id", input.commentId)
    .maybeSingle();
  if (
    !comment ||
    comment.status !== "visible" ||
    !["visible", "restricted"].includes(comment.moderation_state)
  ) {
    return { status: 404, message: "Comment not found." };
  }
  // Same rules as liking the post: live, available, nobody blocked.
  const g = await guard(supabase, userId, comment.post_id);
  if (!("post" in g)) return g;
  if (
    comment.author_id !== userId &&
    (await usersBlocked(supabase, userId, comment.author_id))
  ) {
    return { status: 403, message: "You can't interact with this comment." };
  }
  if (!(await checkRateLimit(`content-comment-like:${userId}`, 300, 3600))) {
    return { status: 429, message: "Slow down a little." };
  }
  if (input.liked) {
    const { error } = await supabase
      .from("content_comment_like")
      .insert({ comment_id: input.commentId, user_id: userId });
    if (error && error.code !== "23505") {
      logger.error(`comment like failed: ${error.message}`);
      return FAIL;
    }
  } else {
    await supabase
      .from("content_comment_like")
      .delete()
      .eq("comment_id", input.commentId)
      .eq("user_id", userId);
  }
  const { data: after } = await supabase
    .from("content_comment")
    .select("like_count")
    .eq("id", input.commentId)
    .maybeSingle();
  return {
    status: 200,
    data: { liked: input.liked, likeCount: after?.like_count ?? 0 },
  };
}
