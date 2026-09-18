import { ReportSheet } from "@/components/ReportSheet";
import {
  useComments,
  usePostCommentsRealtime,
  useSendComment,
} from "@/features/content/commentThread";
import { useRequireSignIn } from "@/features/content/contentLinks";
import { hapticLight } from "@/lib/haptics";
import { useIsOnline } from "@/lib/network";
import type { CachedComment } from "@abonten/core/content/commentCache";
import { countLabel } from "@abonten/core/content/copy";
import { MAX_COMMENT_LENGTH } from "@abonten/core/content/limits";
import {
  AppText,
  Icon,
  Spinner,
  useKeyboardLift,
  useToast,
} from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useCallback, useEffect, useRef, useState } from "react";
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
  withSpring,
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
 *
 * The drag moves the SAME `progress` value the card's video transform reads,
 * on the UI thread: pulling the panel down grows the video back towards full
 * screen under your finger, and letting go either springs both back or
 * hands the remaining distance to the card's close animation, which starts
 * from wherever the drag left off — one continuous motion, no jump.
 *
 * The list is the post's shared comment cache (commentThread.ts), kept live
 * by the post's realtime topic while this panel is mounted.
 */
export function SpotlightCommentsPanel({
  postId,
  progress,
  panelHeight,
  bottomObstruction,
  commentsAllowed,
  commentCount,
  onClose,
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
}) {
  const toast = useToast();
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const online = useIsOnline();
  const requireSignIn = useRequireSignIn();
  const keyboard = useKeyboardLift();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<CachedComment | null>(null);
  const [report, setReport] = useState<CachedComment | null>(null);
  const input = useRef<TextInput>(null);
  const list = useRef<FlatList<CachedComment>>(null);

  const top = useComments(postId, null, true);
  const comments: CachedComment[] =
    top.data?.pages.flatMap((p) => p.comments) ?? [];
  const { send: sendComment } = useSendComment(postId);
  usePostCommentsRealtime(postId, true);

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

  // The comment is on screen immediately (a "sending" row); the composer
  // clears at once. A failure leaves the row with Retry, so nothing typed is
  // lost. Offline, nothing is sent and the text stays in the composer.
  const send = () => {
    const text = body.trim();
    if (!text) return;
    if (!requireSignIn()) return;
    if (!online) {
      toast.info("You're offline. Your comment is still here to send later.");
      return;
    }
    hapticLight();
    const parentId = replyTo?.parentId ?? replyTo?.id ?? null;
    setBody("");
    setReplyTo(null);
    // New top-level comments are listed first; bring yours into view.
    if (!parentId) list.current?.scrollToOffset({ offset: 0, animated: true });
    void sendComment(text, parentId);
  };

  const onReport = useCallback((target: CachedComment) => {
    Keyboard.dismiss();
    setReport(target);
  }, []);

  const close = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  // Distance the panel travels between open and closed.
  const travel = panelHeight + 24;
  const drag = Gesture.Pan()
    .activeOffsetY(6)
    .onStart(() => {
      runOnJS(Keyboard.dismiss)();
    })
    .onChange((e) => {
      progress.value = Math.min(
        1,
        Math.max(0, progress.value - e.changeY / travel),
      );
    })
    .onEnd((e) => {
      if (progress.value < 0.75 || e.velocityY > 800) {
        // The card animates the rest of the way from here.
        runOnJS(close)();
      } else {
        progress.value = withSpring(1, { damping: 22, stiffness: 260 });
      }
    });

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * travel }],
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
          // A sending row keeps its client id as key when the server row
          // replaces it, so the row updates in place instead of remounting.
          keyExtractor={(item) => item.clientId ?? item.id}
          contentContainerStyle={{
            gap: 18,
            paddingLeft: 16,
            // The like column is its own 44pt target; 4pt more than the
            // left gutter keeps the heart visually inset from the edge.
            paddingRight: 8,
            paddingTop: 4,
            paddingBottom: 16,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (top.hasNextPage && !top.isFetchingNextPage && !top.isError)
              top.fetchNextPage();
          }}
          renderItem={({ item }) => (
            <CommentRow
              comment={item}
              postId={postId}
              onReply={commentsAllowed ? setReplyTo : undefined}
              onReport={onReport}
            />
          )}
          ListEmptyComponent={
            top.isLoading && online ? (
              <View className="items-center py-10">
                <Spinner />
              </View>
            ) : !online && !top.data ? (
              <View className="items-center gap-2 py-10">
                <Icon name="cloud-offline-outline" size={28} tone="muted" />
                <AppText variant="muted" className="text-center">
                  You're offline. Comments will load when you're back online.
                </AppText>
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
                disabled={!body.trim()}
                accessibilityRole="button"
                accessibilityLabel="Post comment"
                accessibilityState={{ disabled: !body.trim() }}
                className={[
                  "h-11 w-11 items-center justify-center rounded-full",
                  body.trim() ? "bg-primary" : "bg-muted",
                ].join(" ")}
              >
                <Icon
                  name="arrow-up"
                  size={20}
                  tone={body.trim() ? "inverse" : "muted"}
                />
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
