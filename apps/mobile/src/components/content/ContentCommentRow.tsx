import {
  useComments,
  useDeleteComment,
  useSendComment,
  useToggleCommentLike,
} from "@/features/content/commentThread";
import { useRequireSignIn } from "@/features/content/contentLinks";
import { hapticLight } from "@/lib/haptics";
import type { CachedComment } from "@abonten/core/content/commentCache";
import { formatStoryAge } from "@abonten/core/content/storyExpiry";
import { AppText, Avatar, Icon } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { memo, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

// One comment (and, on demand, its one level of replies) under a Spotlight.
//
// Layout: avatar | name · age, body, actions | like column. The like column
// is a fixed 44pt touch target sitting inside the sheet's 16pt gutter, with
// the count under the heart, so the heart lines up down the list and never
// runs to the screen edge. Text actions (Reply, Delete / Report) get 8pt of
// slop on a 32pt-high row, so they are reachable without crowding the body.
//
// State is the shared comment cache (commentThread.ts): a like here updates
// every copy of this comment and survives rapid taps; your own comment shows
// as "Posting…" until confirmed, or "Couldn't post" with Retry / Remove.
export const CommentRow = memo(function CommentRow({
  comment,
  postId,
  onReply,
  onReport,
  isReply = false,
}: {
  comment: CachedComment;
  postId: string;
  onReply?: (c: CachedComment) => void;
  onReport: (c: CachedComment) => void;
  isReply?: boolean;
}) {
  const t = useTranslations("spotlight");

  const requireSignIn = useRequireSignIn();
  const toggleLike = useToggleCommentLike(requireSignIn);
  const deleteComment = useDeleteComment(postId);
  const { retry, discard } = useSendComment(postId);
  const [showReplies, setShowReplies] = useState(false);
  const replies = useComments(postId, comment.id, showReplies);
  const replyRows: CachedComment[] =
    replies.data?.pages.flatMap((p) => p.comments) ?? [];

  const sending = comment.localState === "sending";
  const failed = comment.localState === "failed";
  const name =
    comment.author.username ?? comment.author.fullName ?? t("someone");

  return (
    <View className={isReply ? "ml-11" : undefined}>
      <View className="flex-row gap-3" style={{ opacity: sending ? 0.6 : 1 }}>
        <Avatar
          publicId={comment.author.avatarPublicId}
          version={comment.author.avatarVersion}
          size={isReply ? 28 : 32}
        />
        <View className="flex-1 gap-1 pt-0.5">
          <View className="flex-row items-center gap-1.5">
            <AppText
              variant="small"
              numberOfLines={1}
              className="shrink font-semibold"
            >
              {name}
            </AppText>
            <AppText variant="caption" tone="muted">
              {sending ? t("posting") : formatStoryAge(comment.createdAt)}
            </AppText>
          </View>
          <AppText variant="small">{comment.body}</AppText>

          {failed ? (
            <View className="min-h-[32px] flex-row items-center gap-4">
              <AppText variant="caption" tone="error">
                {t("couldnTPost")}
              </AppText>
              <TextAction
                label={t("retry")}
                tone="brand"
                onPress={() => void retry(comment)}
              />
              <TextAction
                label={t("remove")}
                tone="muted"
                onPress={() => discard(comment)}
              />
            </View>
          ) : sending ? null : (
            <View className="min-h-[32px] flex-row items-center gap-5">
              {onReply ? (
                <TextAction
                  label={t("reply")}
                  tone="foreground"
                  onPress={() => onReply(comment)}
                />
              ) : null}
              {comment.isMine || comment.canModerate ? (
                <TextAction
                  label={t("deleteText2")}
                  tone="error"
                  onPress={() => void deleteComment(comment)}
                />
              ) : (
                <TextAction
                  label={t("report2")}
                  tone="muted"
                  onPress={() => onReport(comment)}
                />
              )}
            </View>
          )}

          {!isReply && comment.replyCount > 0 ? (
            <Pressable
              onPress={() => setShowReplies((v) => !v)}
              hitSlop={8}
              accessibilityRole="button"
              className="min-h-[28px] flex-row items-center gap-2"
            >
              <View className="h-px w-6 bg-border" />
              <AppText variant="caption" tone="muted" className="font-semibold">
                {showReplies
                  ? t("hideReplies")
                  : t("view2", { replyCount: comment.replyCount })}
              </AppText>
            </Pressable>
          ) : null}
        </View>

        {sending || failed ? (
          <View className="w-11" />
        ) : (
          <Pressable
            onPress={() => {
              hapticLight();
              toggleLike(comment);
            }}
            accessibilityRole="button"
            accessibilityLabel={
              comment.likedByMe
                ? t("unlikeCommentLikes", { likeCount: comment.likeCount })
                : t("likeCommentLikes", { likeCount: comment.likeCount })
            }
            accessibilityState={{ selected: comment.likedByMe }}
            className="min-h-[44px] w-11 items-center pt-0.5 active:opacity-60"
          >
            <Icon
              name={comment.likedByMe ? "heart" : "heart-outline"}
              size={18}
              color={comment.likedByMe ? "#ef4444" : undefined}
              tone={comment.likedByMe ? undefined : "muted"}
            />
            <AppText
              variant="caption"
              tone="muted"
              className="mt-0.5 min-h-[16px]"
            >
              {comment.likeCount > 0 ? comment.likeCount : ""}
            </AppText>
          </Pressable>
        )}
      </View>

      {showReplies ? (
        <View className="mt-3 gap-4">
          {replyRows.map((r) => (
            <CommentRow
              key={r.clientId ?? r.id}
              comment={r}
              postId={postId}
              onReply={onReply}
              onReport={onReport}
              isReply
            />
          ))}
          {replies.isLoading ? <ActivityIndicator /> : null}
          {replies.hasNextPage ? (
            <TextAction
              label={
                replies.isFetchingNextPage ? t("loading") : t("moreReplies")
              }
              tone="muted"
              onPress={() => {
                if (!replies.isFetchingNextPage) replies.fetchNextPage();
              }}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

function TextAction({
  label,
  tone,
  onPress,
}: {
  label: string;
  tone: "brand" | "muted" | "error" | "foreground";
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      className="min-h-[32px] justify-center active:opacity-60"
    >
      <AppText
        variant="caption"
        tone={tone === "foreground" ? undefined : tone}
        className="font-semibold"
      >
        {label}
      </AppText>
    </Pressable>
  );
}
