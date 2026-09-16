import { ReportSheet } from "@/components/ReportSheet";
import { useRequireSignIn } from "@/features/content/contentLinks";
import { useComments } from "@/features/content/useContent";
import { CONTENT_KEY } from "@/features/content/useContentProgram";
import { api } from "@/lib/api";
import { MAX_COMMENT_LENGTH } from "@abonten/core/content/limits";
import { formatStoryAge } from "@abonten/core/content/storyExpiry";
import type { ContentComment } from "@abonten/types/contentType";
import {
  AppText,
  Avatar,
  Icon,
  Sheet,
  Spinner,
  useModalHandoff,
  useToast,
} from "@abonten/ui-native";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";

// Comments on a Spotlight or Story, in a bottom sheet. Replies are one level
// deep; the post's author may delete any comment on their post.
export function ContentCommentsSheet({
  postId,
  open,
  onClose,
  commentsAllowed,
  onCountChange,
}: {
  postId: string;
  open: boolean;
  onClose: () => void;
  commentsAllowed: boolean;
  onCountChange?: (delta: number) => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const requireSignIn = useRequireSignIn();
  const handoff = useModalHandoff();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<ContentComment | null>(null);
  const [sending, setSending] = useState(false);
  const [report, setReport] = useState<ContentComment | null>(null);

  const top = useComments(postId, null, open);
  const comments = top.data?.pages.flatMap((p) => p.comments) ?? [];

  const refresh = () =>
    qc.invalidateQueries({ queryKey: [...CONTENT_KEY, "comments", postId] });

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    if (!requireSignIn()) return;
    setSending(true);
    try {
      const res = await api.content.comment(
        postId,
        text,
        replyTo?.parentId ?? replyTo?.id ?? null,
      );
      if (res.status !== 200) {
        toast.error(res.message ?? "Couldn't post your comment.");
        return;
      }
      setBody("");
      setReplyTo(null);
      onCountChange?.(1);
      refresh();
    } catch {
      toast.error("Couldn't post your comment. Check your connection.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        onDismiss={handoff.onDismiss}
        title="Comments"
        maxHeightRatio={0.8}
        minHeightRatio={0.6}
        footer={
          commentsAllowed ? (
            <View className="gap-1">
              {replyTo ? (
                <View className="flex-row items-center justify-between">
                  <AppText variant="meta">
                    Replying to {replyTo.author.username ?? "comment"}
                  </AppText>
                  <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                    <AppText variant="meta" tone="brand">
                      Cancel
                    </AppText>
                  </Pressable>
                </View>
              ) : null}
              <View className="flex-row items-end gap-2">
                <TextInput
                  value={body}
                  onChangeText={setBody}
                  maxLength={MAX_COMMENT_LENGTH}
                  multiline
                  placeholder="Add a comment…"
                  accessibilityLabel="Write a comment"
                  className="max-h-28 min-h-[44px] flex-1 rounded-xl border border-border bg-muted px-3 py-2.5 text-[15px] text-foreground"
                  placeholderTextColor="#8a8a8a"
                />
                <Pressable
                  onPress={send}
                  disabled={!body.trim() || sending}
                  accessibilityRole="button"
                  accessibilityLabel="Post comment"
                  className={[
                    "h-11 w-11 items-center justify-center rounded-full",
                    body.trim() && !sending ? "bg-primary" : "bg-muted",
                  ].join(" ")}
                >
                  {sending ? (
                    <ActivityIndicator />
                  ) : (
                    <Icon name="arrow-up" size={20} tone="inverse" />
                  )}
                </Pressable>
              </View>
            </View>
          ) : undefined
        }
      >
        {top.isLoading ? (
          <View className="items-center py-10">
            <Spinner />
          </View>
        ) : top.isError ? (
          <View className="items-center gap-2 py-10">
            <AppText variant="muted">Couldn't load comments.</AppText>
            <Pressable onPress={() => top.refetch()}>
              <AppText tone="brand" className="font-semibold">
                Retry
              </AppText>
            </Pressable>
          </View>
        ) : comments.length === 0 ? (
          <AppText variant="muted" className="py-10 text-center">
            {commentsAllowed
              ? "No comments yet. Start the conversation."
              : "Comments are turned off."}
          </AppText>
        ) : (
          <View className="gap-4 pb-2">
            {comments.map((c) => (
              <CommentRow
                key={c.id}
                comment={c}
                postId={postId}
                onReply={commentsAllowed ? setReplyTo : undefined}
                onDeleted={() => {
                  onCountChange?.(-1);
                  refresh();
                }}
                onReport={(target) => {
                  handoff.after(() => setReport(target));
                  onClose();
                }}
              />
            ))}
            {top.hasNextPage ? (
              <Pressable
                onPress={() => top.fetchNextPage()}
                disabled={top.isFetchingNextPage}
                className="items-center py-2"
              >
                <AppText tone="brand" className="font-semibold">
                  {top.isFetchingNextPage ? "Loading…" : "Load more"}
                </AppText>
              </Pressable>
            ) : null}
          </View>
        )}
      </Sheet>
      {report ? (
        <ReportSheet
          open
          onClose={() => setReport(null)}
          targetType="content_comment"
          targetId={report.id}
          label={report.body.slice(0, 80)}
        />
      ) : null}
    </>
  );
}

function CommentRow({
  comment,
  postId,
  onReply,
  onDeleted,
  onReport,
  isReply = false,
}: {
  comment: ContentComment;
  postId: string;
  onReply?: (c: ContentComment) => void;
  onDeleted: () => void;
  onReport: (c: ContentComment) => void;
  isReply?: boolean;
}) {
  const toast = useToast();
  const requireSignIn = useRequireSignIn();
  const [liked, setLiked] = useState(comment.likedByMe);
  const [likeCount, setLikeCount] = useState(comment.likeCount);
  const [showReplies, setShowReplies] = useState(false);
  const replies = useComments(postId, comment.id, showReplies);

  const toggleLike = async () => {
    if (!requireSignIn()) return;
    const next = !liked;
    setLiked(next);
    setLikeCount((n) => Math.max(0, n + (next ? 1 : -1)));
    try {
      const res = await api.content.likeComment(comment.id, next);
      if (res.status !== 200 || !res.data) throw new Error(res.message);
      setLikeCount(res.data.likeCount);
    } catch {
      setLiked(!next);
      setLikeCount((n) => Math.max(0, n + (next ? -1 : 1)));
      toast.error("Couldn't update that like.");
    }
  };

  const remove = async () => {
    try {
      const res = await api.content.deleteComment(comment.id);
      if (res.status !== 200) {
        toast.error(res.message ?? "Couldn't delete this comment.");
        return;
      }
      onDeleted();
    } catch {
      toast.error("Couldn't delete this comment.");
    }
  };

  return (
    <View className={isReply ? "ml-10" : undefined}>
      <View className="flex-row gap-3">
        <Avatar
          publicId={comment.author.avatarPublicId}
          version={comment.author.avatarVersion}
          size={32}
        />
        <View className="flex-1 gap-1">
          <AppText variant="small">
            <AppText variant="small" className="font-semibold">
              {comment.author.username ?? comment.author.fullName ?? "Someone"}
            </AppText>{" "}
            {comment.body}
          </AppText>
          <View className="flex-row items-center gap-4">
            <AppText variant="caption" tone="muted">
              {formatStoryAge(comment.createdAt)}
            </AppText>
            {onReply ? (
              <Pressable onPress={() => onReply(comment)} hitSlop={8}>
                <AppText variant="caption" className="font-semibold">
                  Reply
                </AppText>
              </Pressable>
            ) : null}
            {comment.isMine || comment.canModerate ? (
              <Pressable onPress={remove} hitSlop={8}>
                <AppText variant="caption" tone="error">
                  Delete
                </AppText>
              </Pressable>
            ) : (
              <Pressable onPress={() => onReport(comment)} hitSlop={8}>
                <AppText variant="caption" tone="muted">
                  Report
                </AppText>
              </Pressable>
            )}
          </View>
          {!isReply && comment.replyCount > 0 ? (
            <Pressable onPress={() => setShowReplies((v) => !v)} hitSlop={6}>
              <AppText variant="caption" tone="muted" className="font-semibold">
                {showReplies
                  ? "Hide replies"
                  : `View ${comment.replyCount} ${comment.replyCount === 1 ? "reply" : "replies"}`}
              </AppText>
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={toggleLike}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={liked ? "Unlike comment" : "Like comment"}
          className="items-center"
        >
          <Icon
            name={liked ? "heart" : "heart-outline"}
            size={16}
            color={liked ? "#ef4444" : undefined}
          />
          {likeCount > 0 ? (
            <AppText variant="caption" tone="muted">
              {likeCount}
            </AppText>
          ) : null}
        </Pressable>
      </View>
      {showReplies ? (
        <View className="mt-3 gap-3">
          {(replies.data?.pages.flatMap((p) => p.comments) ?? []).map((r) => (
            <CommentRow
              key={r.id}
              comment={r}
              postId={postId}
              onReply={onReply}
              onDeleted={onDeleted}
              onReport={onReport}
              isReply
            />
          ))}
          {replies.isLoading ? <ActivityIndicator /> : null}
        </View>
      ) : null}
    </View>
  );
}
