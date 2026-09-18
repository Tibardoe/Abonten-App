import { useSession } from "@/auth/SessionProvider";
import type { MyProfile } from "@/features/profile/useProfile";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { uuidv4 } from "@/lib/uuid";
import {
  type CachedComment,
  type CommentsCache,
  appendComment,
  findComment,
  mergeFreshHead,
  patchComment,
  prependComment,
  removeComment,
  replaceComment,
} from "@abonten/core/content/commentCache";
import { createLatestIntentToggle } from "@abonten/core/content/latestIntentToggle";
import {
  channelNeedsRejoin,
  openPrivateChannel,
} from "@abonten/core/messagingRealtime";
import type { ContentCommentsPage } from "@abonten/types/contentType";
import { type ToastApi, useToast } from "@abonten/ui-native";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  type QueryClient,
  onlineManager,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { patchPostCounts } from "./postCacheSync";
import { CONTENT_KEY } from "./useContentProgram";
import { isPostLikePending } from "./usePostEngagement";

// Comments under a post as synchronized server/cache state.
//
// One cache per list (a post's top-level comments, newest first; a
// comment's replies, oldest first), and every change reaches every list
// that holds the comment, through the pure transforms in
// @abonten/core/content/commentCache:
//   * your comment appears at once (a "sending" row), becomes the server
//     row when it is confirmed, or stays as "failed" with Retry;
//   * likes are switches that survive rapid taps (one request in flight,
//     then one for the final intent) and update every copy of the comment;
//   * other people's comments, likes and deletions arrive over the post's
//     realtime topic (usePostCommentsRealtime) while the sheet is open;
//   * the post's comment count is patched in every cached copy of the post.
// Nothing here refetches a whole list to show one change, and a new comment
// is folded in on top without disturbing the pages already loaded.

type Envelope<T> = { status: number; message?: string; data?: T };

export const commentsPrefix = (postId: string) =>
  [...CONTENT_KEY, "comments", postId] as const;

export const commentsKey = (
  postId: string,
  parentId: string | null,
  userId: string | null,
) => [...CONTENT_KEY, "comments", postId, parentId, userId] as const;

function unwrap<T>(res: Envelope<T>): T {
  if (res.status !== 200 || res.data === undefined) {
    throw new Error(res.message ?? "Something went wrong. Please try again.");
  }
  return res.data;
}

export function useComments(
  postId: string,
  parentId: string | null,
  enabled: boolean,
) {
  const { session } = useSession();
  return useInfiniteQuery({
    queryKey: commentsKey(postId, parentId, session?.user.id ?? null),
    enabled,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<ContentCommentsPage> =>
      unwrap(
        await api.content.comments(postId, { parentId, cursor: pageParam }),
      ),
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
    // Live while open (realtime), so re-opening the sheet shows the cache
    // instantly instead of a spinner; a reconnect or a gap reloads it.
    staleTime: 30_000,
  });
}

// ── Cache plumbing ──────────────────────────────────────────────────

function updateList(
  qc: QueryClient,
  postId: string,
  parentId: string | null,
  update: (c: CommentsCache | undefined) => CommentsCache | undefined,
) {
  qc.setQueriesData<CommentsCache>(
    { queryKey: [...commentsPrefix(postId), parentId] },
    (old) => {
      const next = update(old);
      return next === old ? undefined : next;
    },
  );
}

/** Applies to every cached comment list of every post (comment ids are unique). */
function updateEveryList(
  qc: QueryClient,
  update: (c: CommentsCache | undefined) => CommentsCache | undefined,
) {
  qc.setQueriesData<CommentsCache>(
    { queryKey: [...CONTENT_KEY, "comments"] },
    (old) => {
      const next = update(old);
      return next === old ? undefined : next;
    },
  );
}

function bumpReplyCount(
  qc: QueryClient,
  postId: string,
  parentId: string,
  delta: number,
) {
  updateList(qc, postId, null, (c) =>
    patchComment(c, parentId, (p) => ({
      ...p,
      replyCount: Math.max(0, p.replyCount + delta),
    })),
  );
}

// ── Comment likes ───────────────────────────────────────────────────

let toastHost: ToastApi | null = null;
const likeBaselines = new Map<string, { liked: boolean; count: number }>();

const commentLike = createLatestIntentToggle<{ likeCount: number }>({
  send: async (commentId, liked) =>
    unwrap(await api.content.likeComment(commentId, liked)),
  onSettled: (commentId, liked, result) => {
    likeBaselines.delete(commentId);
    updateEveryList(queryClient, (c) =>
      patchComment(c, commentId, (x) => ({
        ...x,
        likedByMe: liked,
        likeCount: result.likeCount,
      })),
    );
  },
  onFailed: (commentId, confirmed) => {
    const base = likeBaselines.get(commentId);
    likeBaselines.delete(commentId);
    if (base) {
      const count =
        base.count + (confirmed === base.liked ? 0 : confirmed ? 1 : -1);
      updateEveryList(queryClient, (c) =>
        patchComment(c, commentId, (x) => ({
          ...x,
          likedByMe: confirmed,
          likeCount: Math.max(0, count),
        })),
      );
    }
    toastHost?.error("Couldn't update that like.");
  },
});

export function isCommentLikePending(commentId: string): boolean {
  return commentLike.isPending(commentId);
}

export function useToggleCommentLike(requireSignIn: () => boolean) {
  const toast = useToast();
  toastHost = toast;
  return useCallback(
    (comment: CachedComment) => {
      if (comment.localState) return;
      if (!requireSignIn()) return;
      if (!onlineManager.isOnline()) {
        toast.info("You're offline. Try again when you're connected.");
        return;
      }
      let base = likeBaselines.get(comment.id);
      if (!base) {
        base = { liked: comment.likedByMe, count: comment.likeCount };
        likeBaselines.set(comment.id, base);
      }
      const desired = !comment.likedByMe;
      const count = Math.max(
        0,
        base.count + (desired ? 1 : 0) - (base.liked ? 1 : 0),
      );
      updateEveryList(queryClient, (c) =>
        patchComment(c, comment.id, (x) => ({
          ...x,
          likedByMe: desired,
          likeCount: count,
        })),
      );
      commentLike.set(comment.id, desired, base.liked);
    },
    [requireSignIn, toast],
  );
}

// ── Writing and removing ────────────────────────────────────────────

function currentAuthor(qc: QueryClient, userId: string) {
  const me = qc.getQueryData<MyProfile | null>(["mobile", "profile"]);
  return {
    id: userId,
    username: me?.username ?? null,
    fullName: me?.full_name ?? null,
    avatarPublicId: me?.avatar_public_id ?? null,
    avatarVersion: me?.avatar_version ?? null,
  };
}

/**
 * Posts a comment or a reply. The row is on screen before the request
 * leaves; on failure it stays, marked, with the text kept for Retry.
 * Resolves true when the server accepted it.
 */
export function useSendComment(postId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const { session } = useSession();

  const deliver = useCallback(
    async (row: CachedComment): Promise<boolean> => {
      const markFailed = () => {
        updateList(qc, postId, row.parentId, (c) =>
          replaceComment(c, row, { ...row, localState: "failed" }),
        );
        patchPostCounts(qc, postId, (n) => ({
          comments: Math.max(0, n.comments - 1),
        }));
        if (row.parentId) bumpReplyCount(qc, postId, row.parentId, -1);
      };
      try {
        const res = await api.content.comment(postId, row.body, row.parentId);
        if (res.status !== 200 || !res.data) {
          markFailed();
          toast.error(res.message ?? "Couldn't post your comment.");
          return false;
        }
        const confirmed: CachedComment = {
          ...res.data,
          clientId: row.clientId,
        };
        updateList(qc, postId, row.parentId, (c) =>
          replaceComment(c, row, confirmed),
        );
        return true;
      } catch {
        markFailed();
        toast.error("Couldn't post your comment. Check your connection.");
        return false;
      }
    },
    [qc, postId, toast],
  );

  const send = useCallback(
    (body: string, parentId: string | null): Promise<boolean> => {
      const userId = session?.user.id;
      if (!userId) return Promise.resolve(false);
      const clientId = uuidv4();
      const row: CachedComment = {
        id: `local:${clientId}`,
        clientId,
        localState: "sending",
        postId,
        parentId,
        body,
        createdAt: new Date().toISOString(),
        likeCount: 0,
        replyCount: 0,
        author: currentAuthor(qc, userId),
        likedByMe: false,
        isMine: true,
        canModerate: false,
      };
      if (parentId) {
        updateList(qc, postId, parentId, (c) => appendComment(c, row));
        bumpReplyCount(qc, postId, parentId, 1);
      } else {
        updateList(qc, postId, null, (c) => prependComment(c, row));
      }
      patchPostCounts(qc, postId, (n) => ({ comments: n.comments + 1 }));
      return deliver(row);
    },
    [qc, postId, session?.user.id, deliver],
  );

  /** Sends a failed row again, in place. */
  const retry = useCallback(
    (row: CachedComment) => {
      const sending: CachedComment = { ...row, localState: "sending" };
      updateList(qc, postId, row.parentId, (c) =>
        replaceComment(c, row, sending),
      );
      patchPostCounts(qc, postId, (n) => ({ comments: n.comments + 1 }));
      if (row.parentId) bumpReplyCount(qc, postId, row.parentId, 1);
      return deliver(sending);
    },
    [qc, postId, deliver],
  );

  /** Throws away a failed row. */
  const discard = useCallback(
    (row: CachedComment) =>
      updateList(qc, postId, row.parentId, (c) => removeComment(c, row)),
    [qc, postId],
  );

  return { send, retry, discard };
}

export function useDeleteComment(postId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useCallback(
    async (comment: CachedComment) => {
      if (comment.localState) return;
      if (!onlineManager.isOnline()) {
        toast.info("You're offline. Try again when you're connected.");
        return;
      }
      const snapshot = qc.getQueriesData<CommentsCache>({
        queryKey: commentsPrefix(postId),
      });
      updateList(qc, postId, comment.parentId, (c) =>
        removeComment(c, comment),
      );
      if (comment.parentId) {
        bumpReplyCount(qc, postId, comment.parentId, -1);
      }
      // The server counts the removed row only (its replies stay counted
      // until they are removed themselves); a post_counts broadcast
      // corrects any difference.
      const removed = 1;
      patchPostCounts(qc, postId, (n) => ({
        comments: Math.max(0, n.comments - removed),
      }));
      const restore = () => {
        for (const [key, data] of snapshot) qc.setQueryData(key, data);
        patchPostCounts(qc, postId, (n) => ({
          comments: n.comments + removed,
        }));
        toast.error("Couldn't delete this comment.");
      };
      try {
        const res = await api.content.deleteComment(comment.id);
        if (res.status !== 200) restore();
      } catch {
        restore();
      }
    },
    [qc, postId, toast],
  );
}

// ── Realtime ────────────────────────────────────────────────────────

type CommentInsertEvent = {
  id: string;
  post_id: string;
  parent_id: string | null;
  author_id: string;
};
type CommentUpdateEvent = {
  id: string;
  post_id: string;
  parent_id: string | null;
  visible: boolean;
  like_count: number;
  reply_count: number;
};
type PostCountsEvent = {
  post_id: string;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
};

function hasSendingRow(cache: CommentsCache | undefined): boolean {
  return !!cache?.pages.some((p) => p.comments.some((c) => c.localState));
}

/**
 * Folds the newest comments into a list without replacing what is loaded.
 * Replies (a short, oldest-first list) are simply reloaded.
 */
async function syncNewest(
  qc: QueryClient,
  postId: string,
  parentId: string | null,
  userId: string | null,
) {
  const key = commentsKey(postId, parentId, userId);
  const cache = qc.getQueryData<CommentsCache>(key);
  if (!cache) return;
  // Our own row is on its way; its confirmation lands it in place, and a
  // reload now would drop the row it is about to replace.
  if (hasSendingRow(cache)) return;
  if (parentId) {
    await qc.invalidateQueries({ queryKey: key, exact: true });
    return;
  }
  try {
    const fresh = unwrap(
      await api.content.comments(postId, { parentId: null, cursor: null }),
    );
    const latest = qc.getQueryData<CommentsCache>(key);
    const pending = new Set<string>();
    for (const page of latest?.pages ?? []) {
      for (const c of page.comments) {
        if (isCommentLikePending(c.id)) pending.add(c.id);
      }
    }
    const merged = mergeFreshHead(latest, fresh, pending);
    if (merged === null) {
      await qc.invalidateQueries({ queryKey: key, exact: true });
    } else if (merged !== latest) {
      qc.setQueryData(key, merged);
    }
  } catch {
    // The next event, reconnect or reopen catches up.
  }
}

/**
 * While a post's comments are open: joins `content_post:<id>` and keeps the
 * cached lists and the post's counts in step with everyone else's writes.
 * One channel per open sheet; rejoins after the app returns to the
 * foreground or the token is refreshed, and catches up on every rejoin.
 */
export function usePostCommentsRealtime(postId: string, enabled: boolean) {
  const qc = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;
    let everJoined = false;
    let channel: RealtimeChannel | null = null;
    const pending = timers.current;

    // Several comments in quick succession are one fetch, not several.
    const schedule = (parentId: string | null) => {
      const k = parentId ?? "top";
      if (pending.has(k)) return;
      pending.set(
        k,
        setTimeout(() => {
          pending.delete(k);
          if (!cancelled) void syncNewest(qc, postId, parentId, userId);
        }, 300),
      );
    };

    const join = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) await supabase.realtime.setAuth(token);
      if (cancelled) return;
      const ch = await openPrivateChannel(
        supabase,
        `content_post:${postId}`,
        () => cancelled,
      );
      if (!ch) return;
      channel = ch;
      ch.on("broadcast", { event: "comment_insert" }, ({ payload }) => {
        const e = payload as CommentInsertEvent | undefined;
        if (!e?.id) return;
        const top = qc.getQueryData<CommentsCache>(
          commentsKey(postId, null, userId),
        );
        if (findComment(top, e.id)) return;
        schedule(e.parent_id ?? null);
      })
        .on("broadcast", { event: "comment_update" }, ({ payload }) => {
          const e = payload as CommentUpdateEvent | undefined;
          if (!e?.id) return;
          if (!e.visible) {
            updateEveryList(qc, (c) => removeComment(c, { id: e.id }));
            return;
          }
          if (isCommentLikePending(e.id)) {
            updateEveryList(qc, (c) =>
              patchComment(c, e.id, (x) =>
                x.replyCount === e.reply_count
                  ? x
                  : { ...x, replyCount: e.reply_count },
              ),
            );
            return;
          }
          updateEveryList(qc, (c) =>
            patchComment(c, e.id, (x) =>
              x.likeCount === e.like_count && x.replyCount === e.reply_count
                ? x
                : { ...x, likeCount: e.like_count, replyCount: e.reply_count },
            ),
          );
        })
        .on("broadcast", { event: "post_counts" }, ({ payload }) => {
          const e = payload as PostCountsEvent | undefined;
          if (!e?.post_id) return;
          patchPostCounts(qc, e.post_id, (n) => ({
            comments: e.comments,
            shares: e.shares,
            saves: e.saves,
            likes: isPostLikePending(e.post_id) ? n.likes : e.likes,
          }));
        })
        .subscribe((status) => {
          if (cancelled || status !== "SUBSCRIBED") return;
          // Anything written while we were not joined: catch up once.
          if (everJoined) schedule(null);
          everJoined = true;
        });
    };
    void join();

    const rejoinIfDown = () => {
      if (cancelled) return;
      if (!channel || channelNeedsRejoin(channel.state)) void join();
    };
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        schedule(null);
        rejoinIfDown();
      }
    });
    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") rejoinIfDown();
    });

    return () => {
      cancelled = true;
      appState.remove();
      authSub.subscription.unsubscribe();
      for (const t of pending.values()) clearTimeout(t);
      pending.clear();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [enabled, userId, postId, qc]);
}
