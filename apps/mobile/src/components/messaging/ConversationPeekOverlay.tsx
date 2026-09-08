import { hapticSelection } from "@/lib/haptics";
import type { ConversationListItem } from "@abonten/api-client";
import { getRelativeTime } from "@abonten/core/dateFormatter";
import type { ConversationType } from "@abonten/types/messagingType";
import { AppText, Avatar, Icon, type IoniconName } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PeekThread } from "./PeekThread";
import type { Rect } from "./contextMenu/menuPlacement";

// The inbox long-press interaction (spec §1–7, §21–22). NOT the shared
// message overlay and NOT a bottom sheet: the pressed conversation "lifts
// out" of the list into a single, perfectly-centred chat peek — no cloned
// list row, no left/right offset — over a translucent scrim that keeps the
// inbox faintly visible. It is gesture-driven:
//
//   • swipe DOWN  → the peek follows the finger and, on release, drops back
//                   into its exact original list position, then dismisses.
//   • swipe UP    → the peek follows the finger, shrinking toward the top;
//                   past a threshold it hands off into the chat screen.
//   • tap         → open the chat (cached data renders instantly).
//   • an action   → run it (all optimistic in useMessagingActions) + dismiss.

export type ConversationMenuTarget = { item: ConversationListItem; rect: Rect };

const TYPE_ICON: Record<ConversationType, IoniconName> = {
  event: "calendar-outline",
  place: "storefront-outline",
  support: "help-buoy-outline",
  direct: "chatbubble-ellipses-outline",
};
const CTX_ICON: Record<ConversationType, IoniconName> = {
  event: "calendar-outline",
  place: "location-outline",
  support: "help-buoy-outline",
  direct: "chatbubble-ellipses-outline",
};

const SCRIM_MAX = 0.62;
const ACTION_ROW_H = 46;
const GAP = 12;

function identityFor(item: ConversationListItem): string {
  return (
    item.other_display_name ||
    item.subject_title ||
    item.title ||
    "Conversation"
  );
}

type Action = {
  key: string;
  label: string;
  icon: IoniconName;
  onPress: () => void;
};

export function ConversationPeekOverlay({
  target,
  currentUserId,
  archivedView = false,
  onDismiss,
  onOpen,
  onToggleRead,
  onToggleMute,
  onToggleArchive,
}: {
  target: ConversationMenuTarget | null;
  /** Whose messages are "mine" in the mini thread. */
  currentUserId: string | undefined;
  archivedView?: boolean;
  onDismiss: () => void;
  onOpen: (item: ConversationListItem) => void;
  onToggleRead: (item: ConversationListItem) => void;
  onToggleMute: (item: ConversationListItem) => void;
  onToggleArchive: (item: ConversationListItem) => void;
}) {
  const c = useThemeColors();
  const screen = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const visible = !!target;
  const item = target?.item ?? null;
  const anchor = target?.rect ?? null;

  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const afterClose = useRef<(() => void) | null>(null);
  const [peekH, setPeekH] = useState<number | null>(null);

  const actions: Action[] = useMemo(() => {
    if (!item) return [];
    const unread = item.unread_count > 0;
    const archived = archivedView || item.archived;
    return [
      {
        key: "read",
        label: unread ? "Mark as read" : "Mark as unread",
        icon: unread ? "checkmark-done-outline" : "ellipse-outline",
        onPress: () => onToggleRead(item),
      },
      {
        key: "mute",
        label: item.muted ? "Unmute" : "Mute",
        icon: item.muted
          ? "notifications-outline"
          : "notifications-off-outline",
        onPress: () => onToggleMute(item),
      },
      {
        key: "archive",
        label: archived ? "Unarchive" : "Archive",
        icon: archived ? "arrow-undo-outline" : "archive-outline",
        onPress: () => onToggleArchive(item),
      },
    ];
  }, [item, archivedView, onToggleRead, onToggleMute, onToggleArchive]);

  const PEEK_W = screen.width - 32;
  const PEEK_LEFT = 16;
  const actionsH = actions.length * ACTION_ROW_H + 12;

  // Not keyed on the measured peek height (only on the stable long-press
  // target + screen metrics) so the card never jumps mid-animation.
  // `anchor.y - 24` keeps it close to where the finger was; the clamp keeps
  // the whole cluster on screen.
  const settledTop = useMemo(() => {
    if (!anchor) return insets.top + 24;
    const estH = 300;
    const minTop = insets.top + 16;
    const maxTop = screen.height - insets.bottom - 16 - estH - GAP - actionsH;
    const want = anchor.y - 60;
    return Math.max(minTop, Math.min(want, Math.max(minTop, maxTop)));
  }, [anchor, screen.height, insets.top, insets.bottom, actionsH]);

  const anchorOffset = anchor ? anchor.y - settledTop : 0;

  const finishClose = useCallback(() => {
    const fn = afterClose.current;
    afterClose.current = null;
    onDismiss();
    fn?.();
  }, [onDismiss]);

  const close = useCallback(
    (after?: () => void) => {
      afterClose.current = after ?? null;
      progress.value = withTiming(
        0,
        { duration: 170, easing: Easing.in(Easing.cubic) },
        (fin) => {
          if (fin) runOnJS(finishClose)();
        },
      );
    },
    [progress, finishClose],
  );

  useEffect(() => {
    if (visible) {
      progress.value = 0;
      drag.value = 0;
      setPeekH(null);
      progress.value = withSpring(1, {
        damping: 18,
        stiffness: 180,
        mass: 0.9,
      });
    }
  }, [visible, progress, drag]);

  // Android hardware back closes the peek (spec §21 — predictable dismiss).
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [visible, close]);

  const openChat = useCallback(() => {
    if (item) onOpen(item);
  }, [item, onOpen]);

  const runAction = useCallback(
    (fn: () => void) => {
      hapticSelection();
      close(fn);
    },
    [close],
  );

  // Play the exit, then open the chat when it settles (spec §5 — a connected
  // preview → chat transition, no intervening loading screen).
  const handoffToChat = useCallback(() => {
    close(openChat);
  }, [close, openChat]);

  const settleBack = useCallback(() => {
    drag.value = withSpring(0, { damping: 16, stiffness: 220 });
  }, [drag]);

  const pan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .failOffsetX([-24, 24])
    .onUpdate((e) => {
      drag.value = e.translationY;
    })
    .onEnd((e) => {
      const down = drag.value > 96 || e.velocityY > 720;
      const up = drag.value < -120 || e.velocityY < -920;
      if (down) {
        // Drop back into the exact original list position, then dismiss:
        // drag → 0 lands it at anchorOffset as progress → 0 unwinds.
        drag.value = withTiming(0, { duration: 190 });
        runOnJS(close)();
      } else if (up) {
        drag.value = withTiming(-screen.height * 0.55, { duration: 220 });
        runOnJS(handoffToChat)();
      } else {
        runOnJS(settleBack)();
      }
    });

  const tap = Gesture.Tap()
    .maxDuration(260)
    .onEnd(() => {
      runOnJS(handoffToChat)();
    });

  const gesture = Gesture.Exclusive(pan, tap);

  const scrimStyle = useAnimatedStyle(() => {
    const recede = Math.min(Math.abs(drag.value) / 460, 0.7);
    return { opacity: progress.value * SCRIM_MAX * (1 - recede) };
  });

  const cardStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const d = drag.value;
    const dragScale = d < 0 ? 1 + Math.max(d / 1200, -0.14) : 1;
    const dragY = d >= 0 ? d : d * 0.92;
    return {
      transform: [
        { translateY: anchorOffset * (1 - p) + dragY },
        { scale: (0.96 + 0.04 * p) * dragScale },
      ],
      opacity: 0.15 + 0.85 * p,
      shadowOpacity: 0.22 * p,
    };
  });

  const actionsStyle = useAnimatedStyle(() => ({
    opacity: progress.value * (drag.value < -40 ? 0.35 : 1),
    transform: [{ translateY: (1 - progress.value) * -6 + drag.value * 0.4 }],
  }));

  if (!visible || !item || !anchor) return null;

  const showAvatar = item.type !== "support" && !!item.other_user_id;
  const subject =
    (item.type === "event" || item.type === "place") &&
    item.subject_title &&
    item.subject_title !== identityFor(item)
      ? item.subject_title
      : null;
  // Sit the action card just under the peek, but never let it run off the
  // bottom edge (spec §18 — respect the safe area / home indicator).
  const actionsTop = Math.min(
    settledTop + (peekH ?? 300) + GAP,
    screen.height - insets.bottom - 12 - actionsH,
  );

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => close()}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1 }} accessibilityViewIsModal>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: c.overlay },
              scrimStyle,
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            onPress={() => close()}
            style={StyleSheet.absoluteFill}
          />

          {/* The lifted, centred chat peek */}
          <GestureDetector gesture={gesture}>
            <Animated.View
              accessibilityRole="button"
              accessibilityLabel={`Open conversation with ${identityFor(item)}`}
              accessibilityHint="Swipe up to open, swipe down to dismiss"
              onLayout={(e) => setPeekH(e.nativeEvent.layout.height)}
              style={[
                {
                  position: "absolute",
                  top: settledTop,
                  left: PEEK_LEFT,
                  width: PEEK_W,
                  borderRadius: 22,
                  backgroundColor: c.card,
                  paddingHorizontal: 16,
                  paddingTop: 14,
                  paddingBottom: 14,
                  shadowColor: "#000",
                  shadowRadius: 30,
                  shadowOffset: { width: 0, height: 18 },
                  elevation: 20,
                },
                cardStyle,
              ]}
            >
              <View className="flex-row items-center gap-3.5">
                {showAvatar ? (
                  <Avatar
                    publicId={item.other_avatar_public_id}
                    version={item.other_avatar_version}
                    size={52}
                  />
                ) : (
                  <View className="h-[52px] w-[52px] items-center justify-center rounded-full bg-accent">
                    <Icon
                      name={TYPE_ICON[item.type]}
                      size={24}
                      tone="primary"
                    />
                  </View>
                )}
                <View className="flex-1 gap-0.5">
                  <View className="flex-row items-center gap-2">
                    <AppText
                      variant="bodyStrong"
                      numberOfLines={1}
                      className="flex-1 text-[17px] leading-[22px]"
                    >
                      {identityFor(item)}
                    </AppText>
                    {item.last_message_at ? (
                      <AppText variant="caption" tone="muted">
                        {getRelativeTime(item.last_message_at)}
                      </AppText>
                    ) : null}
                  </View>
                  {subject ? (
                    <View className="flex-row items-center gap-1">
                      <Icon name={CTX_ICON[item.type]} size={12} tone="muted" />
                      <AppText
                        variant="meta"
                        numberOfLines={1}
                        className="flex-1 text-[13px]"
                      >
                        {subject}
                      </AppText>
                    </View>
                  ) : null}
                </View>
              </View>

              <View
                style={{
                  height: StyleSheet.hairlineWidth,
                  backgroundColor: c.border,
                  marginTop: 12,
                  marginBottom: 10,
                }}
              />

              {/* The chat itself, not just its last line -- see PeekThread. */}
              <PeekThread
                conversationId={item.conversation_id}
                currentUserId={currentUserId}
              />

              {item.muted || item.unread_count > 0 ? (
                <View className="mt-2.5 flex-row items-center gap-2">
                  {item.muted ? (
                    <View className="flex-row items-center gap-1">
                      <Icon
                        name="notifications-off-outline"
                        size={13}
                        tone="muted"
                      />
                      <AppText variant="caption" tone="muted">
                        Muted
                      </AppText>
                    </View>
                  ) : null}
                  {item.unread_count > 0 ? (
                    <View
                      className="items-center justify-center rounded-full bg-primary"
                      style={{ minWidth: 20, height: 20, paddingHorizontal: 6 }}
                    >
                      <AppText
                        allowFontScaling={false}
                        className="text-[11px] font-bold text-primary-foreground"
                      >
                        {item.unread_count > 99 ? "99+" : item.unread_count} new
                      </AppText>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </Animated.View>
          </GestureDetector>

          {/* Contextual actions — iOS-menu list: label leading, icon
              trailing, hairline separators. */}
          <Animated.View
            style={[
              {
                position: "absolute",
                top: actionsTop,
                left: PEEK_LEFT + (PEEK_W - Math.min(PEEK_W, 300)) / 2,
                width: Math.min(PEEK_W, 300),
                borderRadius: 14,
                backgroundColor: c.popover,
                shadowColor: "#000",
                shadowOpacity: 0.16,
                shadowRadius: 22,
                shadowOffset: { width: 0, height: 10 },
                elevation: 16,
                overflow: "hidden",
              },
              actionsStyle,
            ]}
          >
            {actions.map((a, i) => (
              <View key={a.key}>
                {i > 0 ? (
                  <View
                    style={{
                      height: StyleSheet.hairlineWidth,
                      backgroundColor: c.border,
                    }}
                  />
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={a.label}
                  onPress={() => runAction(a.onPress)}
                  android_ripple={{ color: c.accent }}
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? c.accent : "transparent",
                  })}
                >
                  <View
                    style={{
                      height: ACTION_ROW_H,
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 16,
                    }}
                  >
                    <AppText
                      variant="body"
                      numberOfLines={1}
                      style={{
                        flexGrow: 1,
                        flexShrink: 1,
                        marginRight: 12,
                        fontSize: 16,
                      }}
                    >
                      {a.label}
                    </AppText>
                    <Icon name={a.icon} size={20} color={c.foreground} />
                  </View>
                </Pressable>
              </View>
            ))}
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
