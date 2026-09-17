import { useRequireSignIn } from "@/features/content/contentLinks";
import { useComments } from "@/features/content/useContent";
import { api } from "@/lib/api";
import { formatStoryAge } from "@abonten/core/content/storyExpiry";
import type { ContentComment } from "@abonten/types/contentType";
import { AppText, Avatar, Icon, useToast } from "@abonten/ui-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

// One comment (and, on demand, its one level of replies) under a Spotlight.
// Likes are optimistic and roll back on failure; the author of the post and
// the comment's own author may delete it, everyone else may report it.
export function CommentRow({
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
