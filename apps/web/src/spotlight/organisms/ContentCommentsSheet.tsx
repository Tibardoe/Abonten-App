"use client";

import { createContentComment } from "@/actions/content/createContentComment";
import { deleteContentComment } from "@/actions/content/deleteContentComment";
import { listContentComments } from "@/actions/content/listContentComments";
import { setContentCommentLike } from "@/actions/content/setContentCommentLike";
import { ReportDialog } from "@/components/organisms/ReportDialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useToast } from "@/hooks/useToast";
import { MAX_COMMENT_LENGTH } from "@abonten/core/content/limits";
import { formatStoryAge } from "@abonten/core/content/storyExpiry";
import type {
  ContentComment,
  ContentCommentsPage,
} from "@abonten/types/contentType";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { IoHeart, IoHeartOutline } from "react-icons/io5";
import { publisherAvatarUrl } from "../lib/publisher";
import { dataOf, messageOf } from "../lib/result";

type Props = {
  postId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commentsAllowed: boolean;
  onCountChange?: (delta: number) => void;
};

function commentsKey(postId: string, parentId: string | null) {
  return ["content", "comments", postId, parentId] as const;
}

function useComments(
  postId: string,
  parentId: string | null,
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey: commentsKey(postId, parentId),
    enabled,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<ContentCommentsPage> => {
      const res = await listContentComments({
        postId,
        parentId,
        cursor: pageParam ?? undefined,
      });
      const data = dataOf(res);
      if (!data) throw new Error(messageOf(res));
      return data;
    },
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
  });
}

export default function ContentCommentsSheet({
  postId,
  open,
  onOpenChange,
  commentsAllowed,
  onCountChange,
}: Props) {
  const { data: user } = useCurrentUser();
  const requireAuth = useRequireAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<ContentComment | null>(null);

  const top = useComments(postId, null, open);
  const comments = top.data?.pages.flatMap((p) => p.comments) ?? [];

  const send = useMutation({
    mutationFn: () =>
      createContentComment({
        postId,
        parentId: replyTo?.parentId ?? replyTo?.id ?? null,
        body,
      }),
    onSuccess: (res) => {
      const created = dataOf(res);
      if (!created) {
        toast.error(messageOf(res, "Couldn't post your comment."));
        return;
      }
      setBody("");
      setReplyTo(null);
      onCountChange?.(1);
      qc.invalidateQueries({ queryKey: ["content", "comments", postId] });
    },
    onError: () => toast.error("Couldn't post your comment. Please try again."),
  });

  const submit = async () => {
    if (!body.trim() || send.isPending) return;
    if (!(await requireAuth())) return;
    send.mutate();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <div className="border-b px-4 py-3">
          <SheetTitle className="text-base">Comments</SheetTitle>
          <SheetDescription className="sr-only">
            Read and write comments on this post.
          </SheetDescription>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {top.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : top.isError ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <p>Couldn't load comments.</p>
              <button
                type="button"
                onClick={() => top.refetch()}
                className="mt-2 font-medium text-primary hover:underline"
              >
                Retry
              </button>
            </div>
          ) : comments.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {commentsAllowed
                ? "No comments yet. Start the conversation."
                : "Comments are turned off."}
            </p>
          ) : (
            <ul className="space-y-4">
              {comments.map((comment) => (
                <CommentRow
                  key={comment.id}
                  comment={comment}
                  postId={postId}
                  onReply={commentsAllowed ? setReplyTo : undefined}
                  onDeleted={() => onCountChange?.(-1)}
                />
              ))}
            </ul>
          )}
          {top.hasNextPage ? (
            <button
              type="button"
              disabled={top.isFetchingNextPage}
              onClick={() => top.fetchNextPage()}
              className="mt-4 w-full text-center text-sm font-medium text-primary hover:underline disabled:opacity-60"
            >
              {top.isFetchingNextPage ? "Loading…" : "Load more comments"}
            </button>
          ) : null}
        </div>

        {commentsAllowed ? (
          <form
            className="border-t p-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            {replyTo ? (
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Replying to{" "}
                  <span className="font-semibold">
                    {replyTo.author.username ?? "comment"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={MAX_COMMENT_LENGTH}
                rows={1}
                placeholder={user ? "Add a comment…" : "Sign in to comment"}
                aria-label="Write a comment"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                className="max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border bg-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={!body.trim() || send.isPending}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {send.isPending ? "Posting…" : "Post"}
              </button>
            </div>
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function CommentRow({
  comment,
  postId,
  onReply,
  onDeleted,
  isReply = false,
}: {
  comment: ContentComment;
  postId: string;
  onReply?: (comment: ContentComment) => void;
  onDeleted: () => void;
  isReply?: boolean;
}) {
  const requireAuth = useRequireAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const [liked, setLiked] = useState(comment.likedByMe);
  const [likeCount, setLikeCount] = useState(comment.likeCount);
  const [showReplies, setShowReplies] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const replies = useComments(postId, comment.id, showReplies);

  const toggleLike = async () => {
    if (!(await requireAuth())) return;
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    const res = await setContentCommentLike({
      commentId: comment.id,
      liked: next,
    });
    const data = dataOf(res);
    if (!data) {
      setLiked(!next);
      setLikeCount((c) => Math.max(0, c + (next ? -1 : 1)));
      toast.error(messageOf(res));
      return;
    }
    setLikeCount(data.likeCount);
  };

  const remove = async () => {
    const res = await deleteContentComment({ commentId: comment.id });
    if (res.status !== 200) {
      toast.error(messageOf(res, "Couldn't delete this comment."));
      return;
    }
    qc.setQueriesData<InfiniteData<ContentCommentsPage>>(
      { queryKey: ["content", "comments", postId] },
      (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((p) => ({
                ...p,
                comments: p.comments.filter((c) => c.id !== comment.id),
              })),
            }
          : old,
    );
    onDeleted();
  };

  const name = comment.author.username ?? comment.author.fullName ?? "Someone";

  return (
    <li className={isReply ? "ml-10" : undefined}>
      <div className="flex gap-3">
        <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted">
          <Image
            src={publisherAvatarUrl(comment.author, 32)}
            alt=""
            fill
            sizes="32px"
            className="object-cover"
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="mr-1.5 font-semibold">{name}</span>
            <span className="whitespace-pre-wrap break-words">
              {comment.body}
            </span>
          </p>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span>{formatStoryAge(comment.createdAt)}</span>
            {onReply ? (
              <button
                type="button"
                onClick={() => onReply(comment)}
                className="font-medium hover:text-foreground"
              >
                Reply
              </button>
            ) : null}
            {comment.isMine || comment.canModerate ? (
              <button
                type="button"
                onClick={remove}
                className="font-medium hover:text-destructive"
              >
                Delete
              </button>
            ) : user ? (
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                className="font-medium hover:text-destructive"
              >
                Report
              </button>
            ) : null}
          </div>
          {!isReply && comment.replyCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowReplies((v) => !v)}
              className="mt-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {showReplies
                ? "Hide replies"
                : `View ${comment.replyCount} ${comment.replyCount === 1 ? "reply" : "replies"}`}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={toggleLike}
          aria-pressed={liked}
          aria-label={liked ? "Unlike comment" : "Like comment"}
          className="flex shrink-0 flex-col items-center text-xs text-muted-foreground"
        >
          {liked ? (
            <IoHeart className="text-base text-red-500" />
          ) : (
            <IoHeartOutline className="text-base" />
          )}
          {likeCount > 0 ? likeCount : null}
        </button>
      </div>

      {showReplies ? (
        <ul className="mt-3 space-y-3">
          {replies.data?.pages
            .flatMap((p) => p.comments)
            .map((reply) => (
              <CommentRow
                key={reply.id}
                comment={reply}
                postId={postId}
                onReply={onReply}
                onDeleted={onDeleted}
                isReply
              />
            ))}
          {replies.hasNextPage ? (
            <li className="ml-10">
              <button
                type="button"
                onClick={() => replies.fetchNextPage()}
                className="text-xs font-medium text-primary hover:underline"
              >
                More replies
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}

      {reportOpen ? (
        <ReportDialog
          open
          onOpenChange={setReportOpen}
          targetType="content_comment"
          targetId={comment.id}
          targetLabel={comment.body.slice(0, 80)}
        />
      ) : null}
    </li>
  );
}
