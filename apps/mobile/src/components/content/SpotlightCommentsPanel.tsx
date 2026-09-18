import { ReportSheet } from "@/components/ReportSheet";
import { useRequireSignIn } from "@/features/content/contentLinks";
import { useComments } from "@/features/content/useContent";
import { CONTENT_KEY } from "@/features/content/useContentProgram";
import { api } from "@/lib/api";
import { hapticLight } from "@/lib/haptics";

import { countLabel } from "@abonten/core/content/copy";
import { MAX_COMMENT_LENGTH } from "@abonten/core/content/limits";
import type { ContentComment } from "@abonten/types/contentType";
import {
  AppText,
  Icon,
  Spinner,
  useKeyboardLift,
  useToast,
} from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Keyboard,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  type SharedValue,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommentRow } from "./ContentCommentRow";

/**
 * Comments under a Spotlight, the short-video way: the card shrinks its
 * video into the top of the screen (SpotlightCard drives that from the same
 * `progress` value) and this panel rises into the space below, so the video
 * stays visible and keeps playing. It lives inside the card — not a <Modal>
 * — so the keyboard, the panel and the video are one layout in one window:
 * the composer rides the keyboard frame by frame (useKeyboardLift) instead
 * of jumping once it has finished opening.
 *
 * Close: the X, a drag down on the handle, a tap on the video above, or
 * Android back (which first just drops the keyboard).
 */
export function SpotlightCommentsPanel({
  postId,
  progress,
  panelHeight,
  bottomObstruction,
  commentsAllowed,
  commentCount,
  onClose,
  onCountChange,
}: {
  postId: string;
  /** 0 closed → 1 open, owned by the card. */
  progress: SharedValue<number>;
  panelHeight: number;
  /** Height of whatever sits under the card's bottom edge (the tab bar). */
  bottomObstruction: number;
  commentsAllowed: boolean;
  commentCount: number;
  onClose: () => void;
  onCountChange: (delta: number) => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const requireSignIn = useRequireSignIn();
  const keyboard = useKeyboardLift();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<ContentComment | null>(null);
  const [sending, setSending] = useState(false);
  const [report, setReport] = useState<ContentComment | null>(null);
  const input = useRef<TextInput>(null);
  const list = useRef<FlatList<ContentComment>>(null);
  const dragY = useSharedValue(0);

  const top = useComments(postId, null, true);
  const comments = top.data?.pages.flatMap((p) => p.comments) ?? [];

  useEffect(() => {
    if (replyTo) input.current?.focus();
  }, [replyTo]);

  // Android back: drop the keyboard first, then close the panel.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (Keyboard.isVisible()) {
        Keyboard.dismiss();
        return true;
      }
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

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
      hapticLight();
      setBody("");
      const wasReply = !!replyTo;
      setReplyTo(null);
      onCountChange(1);
      await qc.invalidateQueries({
        queryKey: [...CONTENT_KEY, "comments", postId],
      });
      // New top-level comments are listed first; bring yours into view.
      if (!wasReply)
        list.current?.scrollToOffset({ offset: 0, animated: true });
    } catch {
      toast.error("Couldn't post your comment. Check your connection.");
    } finally {
      setSending(false);
    }
  };

  const close = () => {
    Keyboard.dismiss();
    onClose();
  };

  const drag = Gesture.Pan()
    .onChange((e) => {
      dragY.value = Math.max(0, dragY.value + e.changeY);
    })
    .onEnd((e) => {
      if (dragY.value > panelHeight * 0.25 || e.velocityY > 800) {
        dragY.value = withTiming(panelHeight, { duration: 160 }, () => {
          dragY.value = 0;
          runOnJS(close)();
        });
      } else {
        dragY.value = withSpring(0, { damping: 22, stiffness: 260 });
      }
    });

  const panelStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: (1 - progress.value) * (panelHeight + 24) + dragY.value },
    ],
    // The keyboard rises from the screen's bottom edge; only the part of it
    // above the tab bar eats into the panel.
    paddingBottom: Math.max(0, keyboard.height.value - bottomObstruction),
  }));

  return (
    <>
      <Animated.View
        style={[
          {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: panelHeight,
          },
          panelStyle,
        ]}
        className="overflow-hidden rounded-t-3xl bg-popover"
        accessibilityViewIsModal
      >
        <GestureDetector gesture={drag}>
          <View>
            <View className="items-center pb-1 pt-2.5">
              <View className="h-1 w-10 rounded-full bg-border" />
            </View>
            <View className="flex-row items-center px-4 pb-2">
              <View className="w-9" />
              <AppText
                variant="bodyStrong"
                accessibilityRole="header"
                className="flex-1 text-center"
              >
                {commentCount > 0
                  ? countLabel(commentCount, "comment")
                  : "Comments"}
              </AppText>
              <Pressable
                onPress={close}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close comments"
                className="h-9 w-9 items-center justify-center rounded-full active:bg-muted"
              >
                <Icon name="close" size={22} tone="muted" />
              </Pressable>
            </View>
          </View>
        </GestureDetector>

        <FlatList
          ref={list}
          style={{ flex: 1 }}
          data={comments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            gap: 16,
            paddingHorizontal: 16,
            paddingTop: 4,
            paddingBottom: 16,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (top.hasNextPage && !top.isFetchingNextPage) top.fetchNextPage();
          }}
          renderItem={({ item }) => (
            <CommentRow
              comment={item}
              postId={postId}
              onReply={commentsAllowed ? setReplyTo : undefined}
              onDeleted={() => {
                onCountChange(-1);
                qc.invalidateQueries({
                  queryKey: [...CONTENT_KEY, "comments", postId],
                });
              }}
              onReport={(target) => {
                Keyboard.dismiss();
                setReport(target);
              }}
            />
          )}
          ListEmptyComponent={
            top.isLoading ? (
              <View className="items-center py-10">
                <Spinner />
              </View>
            ) : top.isError ? (
              <View className="items-center gap-2 py-10">
                <AppText variant="muted">Couldn't load comments.</AppText>
                <Pressable onPress={() => top.refetch()} hitSlop={8}>
                  <AppText tone="brand" className="font-semibold">
                    Retry
                  </AppText>
                </Pressable>
              </View>
            ) : (
              <View className="items-center gap-2 py-10">
                <Icon
                  name="chatbubble-ellipses-outline"
                  size={30}
                  tone="muted"
                />
                <AppText variant="muted" className="text-center">
                  {commentsAllowed
                    ? "No comments yet. Start the conversation."
                    : "Comments are turned off."}
                </AppText>
              </View>
            )
          }
          ListFooterComponent={
            top.isFetchingNextPage ? <ActivityIndicator /> : null
          }
        />

        {commentsAllowed ? (
          <View
            className="gap-1 border-t border-border px-3 pt-2"
            style={{
              paddingBottom: Math.max(8, insets.bottom - bottomObstruction),
            }}
          >
            {replyTo ? (
              <View className="flex-row items-center justify-between px-1">
                <AppText variant="meta" numberOfLines={1} className="flex-1">
                  Replying to {replyTo.author.username ?? "a comment"}
                </AppText>
                <Pressable
                  onPress={() => setReplyTo(null)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel reply"
                >
                  <AppText variant="meta" tone="brand">
                    Cancel
                  </AppText>
                </Pressable>
              </View>
            ) : null}
            <View className="flex-row items-end gap-2">
              <TextInput
                ref={input}
                value={body}
                onChangeText={setBody}
                maxLength={MAX_COMMENT_LENGTH}
                multiline
                placeholder="Add a comment…"
                accessibilityLabel="Write a comment"
                placeholderTextColor={c["muted-foreground"]}
                className="max-h-28 min-h-[44px] flex-1 rounded-3xl bg-muted px-4 py-2.5 text-[15px] text-foreground"
              />
              <Pressable
                onPress={send}
                disabled={!body.trim() || sending}
                accessibilityRole="button"
                accessibilityLabel="Post comment"
                accessibilityState={{ disabled: !body.trim() || sending }}
                className={[
                  "h-11 w-11 items-center justify-center rounded-full",
                  body.trim() && !sending ? "bg-primary" : "bg-muted",
                ].join(" ")}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Icon
                    name="arrow-up"
                    size={20}
                    tone={body.trim() ? "inverse" : "muted"}
                  />
                )}
              </Pressable>
            </View>
          </View>
        ) : null}
      </Animated.View>

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
