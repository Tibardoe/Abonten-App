import { AppText, Icon, type IoniconName } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Keyboard,
  Modal,
  Pressable,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Rect, computeMenuLeft, computePlacement } from "./menuPlacement";

// The shared "pick the item up into its own layer" interaction used by both
// the message bubbles and the inbox rows (spec §1–7, §21–22). NOT a bottom
// sheet and NOT a full modal: the pressed item stays anchored where it was,
// the rest of the conversation stays visible under a light scrim, and one
// coherent cluster — reaction bar closest to the item, then a compact action
// card — springs in on whichever side has room.

export type ContextAction = {
  key: string;
  label: string;
  icon: IoniconName;
  destructive?: boolean;
  onPress: () => void;
};

/** `dismiss(after)` plays the close animation then runs `after` (used by the
 *  reaction bar so a pick closes the overlay before the pill lands). */
export type DismissFn = (after?: () => void) => void;

type Props = {
  visible: boolean;
  anchor: Rect | null;
  onDismiss: () => void;
  actions: ContextAction[];
  /** The lifted clone of the pressed item. */
  renderPreview: () => ReactNode;
  /** Which screen edge the cluster hugs. */
  align?: "start" | "end";
  /** The reaction bar, rendered adjacent to the preview. */
  renderAccessory?: (dismiss: DismissFn) => ReactNode;
  accessoryHeight?: number;
  /** Clamp a wide preview (e.g. an image bubble). */
  maxPreviewWidth?: number;
  a11yPreviewLabel?: string;
};

// Reaction bar + menu share this width so the cluster reads as one surface.
const CLUSTER_WIDTH = 246;
// iOS-menu metrics: edge-to-edge rows, hairline separators, no vertical pad.
const ACTION_ROW_H = 44;
const MENU_V_PAD = 0;
const SCRIM_MAX = 0.62;

export function ContextualActionOverlay({
  visible,
  anchor,
  onDismiss,
  actions,
  renderPreview,
  align = "start",
  renderAccessory,
  accessoryHeight = 0,
  maxPreviewWidth,
  a11yPreviewLabel,
}: Props) {
  const c = useThemeColors();
  const screen = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const progress = useSharedValue(0);
  const afterClose = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (visible) {
      // A keyboard open behind the overlay would fight the anchored cluster
      // for space (spec §26 / §29) — drop it; the composer keeps its draft.
      Keyboard.dismiss();
      progress.value = 0;
      // A springy "pop" — the item lifts out with a touch of overshoot, the
      // way iMessage / WhatsApp present a long-pressed message.
      progress.value = withSpring(1, {
        damping: 19,
        stiffness: 230,
        mass: 0.8,
      });
    }
  }, [visible, progress]);

  const finishClose = useCallback(() => {
    const fn = afterClose.current;
    afterClose.current = null;
    onDismiss();
    fn?.();
  }, [onDismiss]);

  const close = useCallback<DismissFn>(
    (after) => {
      afterClose.current = after ?? null;
      progress.value = withTiming(
        0,
        { duration: 120, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(finishClose)();
        },
      );
    },
    [progress, finishClose],
  );

  const hasAccessory = !!renderAccessory;
  const menuHeight = actions.length * ACTION_ROW_H + MENU_V_PAD * 2;
  const accH = hasAccessory ? accessoryHeight || 50 : 0;

  const placement = useMemo(() => {
    if (!anchor) return null;
    return computePlacement({
      anchor,
      screen: { width: screen.width, height: screen.height },
      insets: { top: insets.top, bottom: insets.bottom },
      keyboardHeight: 0,
      menuHeight,
      accessoryHeight: accH,
    });
  }, [
    anchor,
    screen.width,
    screen.height,
    insets.top,
    insets.bottom,
    menuHeight,
    accH,
  ]);

  // Anchor the lifted clone to the SAME screen edge the bubble hugs and let
  // it size to its content under the same max-width rule a real bubble uses,
  // rather than pinning it to the measured width. Pinning re-ran the text
  // layout inside a box that then re-applied the bubble's own horizontal
  // padding — an exact fit that sub-pixel rounding could tip into an extra
  // line, so a one-line message visibly re-wrapped as it lifted and stopped
  // reading as the same object.
  const previewAnchorStyle: ViewStyle = anchor
    ? align === "end"
      ? { right: Math.max(0, screen.width - (anchor.x + anchor.width)) }
      : { left: anchor.x }
    : {};

  const clusterLeft = anchor
    ? computeMenuLeft({
        anchor,
        menuWidth: CLUSTER_WIDTH,
        screenWidth: screen.width,
        align,
      })
    : 0;

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: progress.value * SCRIM_MAX,
  }));

  const previewStyle = useAnimatedStyle(() => {
    if (!anchor || !placement) return {};
    const p = progress.value;
    // Anchored to where the finger was; only nudged if the cluster couldn't
    // otherwise fit. A small rise + scale sell "lifted closer to you" (§8).
    const p1 = Math.min(p, 1);
    const top = anchor.y + (placement.previewTop - anchor.y) * p1 - 7 * p1;
    return {
      top,
      transform: [{ scale: 1 + 0.045 * p }],
      shadowOpacity: 0.26 * p1,
    };
  });

  const clusterStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const p1 = Math.min(p, 1);
    return {
      opacity: p1,
      transform: [
        { translateY: (1 - p1) * (placement?.side === "above" ? 10 : -10) },
        { scale: 0.94 + 0.06 * p },
      ],
    };
  });

  if (!visible || !anchor || !placement) return null;

  const menuCard: StyleProp<ViewStyle> = {
    position: "absolute",
    top: placement.menuTop,
    left: clusterLeft,
    width: CLUSTER_WIDTH,
    borderRadius: 13,
    paddingVertical: MENU_V_PAD,
    backgroundColor: c.popover,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
    overflow: "hidden",
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={() => close()}
      statusBarTranslucent
    >
      <View style={{ flex: 1 }} accessibilityViewIsModal>
        {/* Light scrim — the conversation stays legible underneath (spec §2) */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: c.overlay },
            scrimStyle,
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss menu"
          onPress={() => close()}
          style={StyleSheet.absoluteFill}
        />

        {/* Lifted preview — anchored, brighter, raised */}
        <Animated.View
          pointerEvents="none"
          accessible
          accessibilityLabel={a11yPreviewLabel}
          style={[
            {
              position: "absolute",
              maxWidth: maxPreviewWidth ?? screen.width * 0.92,
              alignItems: align === "end" ? "flex-end" : "flex-start",
              shadowColor: "#000",
              shadowRadius: 26,
              shadowOffset: { width: 0, height: 12 },
            },
            previewAnchorStyle,
            previewStyle,
          ]}
        >
          {renderPreview()}
        </Animated.View>

        {/* Reaction bar — adjacent to the preview on both sides */}
        {renderAccessory ? (
          <Animated.View
            style={[
              {
                position: "absolute",
                top: placement.accessoryTop,
                left: clusterLeft,
                width: CLUSTER_WIDTH,
                alignItems: align === "end" ? "flex-end" : "flex-start",
              },
              clusterStyle,
            ]}
          >
            {renderAccessory(close)}
          </Animated.View>
        ) : null}

        {/* Action menu — an iOS-style list: label leading, icon trailing,
            hairline separators, edge-to-edge rows. The label + icon live in
            one explicit flex row so they can never wrap onto two lines. */}
        <Animated.View style={[menuCard, clusterStyle]}>
          {actions.map((a, i) => {
            const tint = a.destructive ? c.destructive : c.foreground;
            return (
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
                  onPress={() => close(a.onPress)}
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
                        color: tint,
                      }}
                    >
                      {a.label}
                    </AppText>
                    <Icon name={a.icon} size={20} color={tint} />
                  </View>
                </Pressable>
              </View>
            );
          })}
        </Animated.View>
      </View>
    </Modal>
  );
}
