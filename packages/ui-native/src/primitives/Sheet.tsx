import { type ReactNode, useEffect, useRef } from "react";
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../theme/ThemeProvider";
import { shadow } from "../theme/tokens";
import { Icon } from "./Icon";
import { SectionTitle } from "./Typography";
import { useKeyboardHeight } from "./useKeyboard";

// Native echo of apps/web/src/components/atoms/BottomSheet.tsx — the surface
// the web app uses for the filter modal, date pickers, and anchored menus.
// Same prop shape (`open` / `onClose` / `title` / `footer`) so those flows
// port across. Built on RN's Modal so it needs no extra dependency.
//
// Keyboard handling: `adjustResize` does NOT apply to content inside a RN
// <Modal>, and a `KeyboardAvoidingView behavior="padding"` on a flex-end
// container pushes the WHOLE panel up by the keyboard height without
// shrinking it — so a tall sheet (location picker, filters) ends up with
// its header shoved off the top of the screen. Instead we track the
// keyboard height ourselves and (a) lift the panel by exactly that height
// so the footer clears the keyboard, and (b) cap the panel's max-height to
// the space that's left above the keyboard so the title bar and close
// button stay on-screen. The scroll view then scrolls the focused field
// into that visible window. Every bottom sheet renders through here, so
// this behaviour is uniform.
//
// Dismissal: tap the scrim, tap the X, hardware back — or drag the grab
// handle down. The pan gesture is bound to the handle + title bar ONLY,
// never to the scrolling content: a sheet is often a form or a long option
// list, and a whole-panel drag would fight the ScrollView and swallow taps
// on inputs. Dragging past a third of the panel (or flicking) dismisses;
// anything less springs back, so a half-committed drag never loses the
// user's place. It runs on the UI thread via Reanimated, so it tracks the
// finger even while the screen underneath is busy.
//
// The panel is wrapped in its own <GestureHandlerRootView>: an RN <Modal>
// renders into a SEPARATE native view hierarchy, so the app-root one in
// app/_layout.tsx does not reach inside it and every gesture here is
// silently dropped without it. (Confirmed on device — the drag simply did
// nothing until this was added.)

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** When set, a back chevron shows left of the title (multi-step sheets). */
  onBack?: () => void;
  footer?: ReactNode;
  children: ReactNode;
  /** Cap the sheet height as a fraction of the screen (default 0.85). */
  maxHeightRatio?: number;
  /**
   * Float the sheet up to at least this fraction of the screen even when its
   * content is short — so important sheets (location picker, add wallet,
   * create actions, filters) don't sit buried at the bottom edge. Responsive:
   * it's a ratio of the live window height, never a fixed pixel value.
   */
  minHeightRatio?: number;
};

export function Sheet({
  open,
  onClose,
  title,
  onBack,
  footer,
  children,
  maxHeightRatio = 0.85,
  minHeightRatio,
}: SheetProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const c = useThemeColors();

  // Live drag offset of the panel, and the panel's measured height (the
  // dismissal threshold and the scrim fade are both fractions of it).
  const dragY = useSharedValue(0);
  const panelHeight = useSharedValue(0);

  // Live keyboard height, from the shared listener hook.
  const kbHeight = useKeyboardHeight();
  useEffect(() => {
    // Every time the sheet closes, drop the keyboard — otherwise a sheet
    // dismissed while its input was focused can leave the keyboard up over
    // the next screen.
    if (!open) Keyboard.dismiss();
    // Reset the drag on open, so a sheet dismissed by dragging doesn't
    // reopen already pushed off the bottom of the screen.
    else dragY.value = 0;
  }, [open, dragY]);

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
  }));

  // The scrim thins out as the panel is dragged away, so the gesture reads
  // as letting go of this screen rather than a panel sliding over a constant
  // wall of grey.
  const scrimStyle = useAnimatedStyle(() => {
    const h = panelHeight.value || 1;
    const progress = Math.min(1, Math.max(0, dragY.value / h));
    return { opacity: 0.6 * (1 - progress) };
  });

  const dragGesture = Gesture.Pan()
    .onChange((e) => {
      // Downward only — a sheet already at its max height has nowhere to go
      // upward, and letting it rubber-band up would uncover the scrim.
      dragY.value = Math.max(0, dragY.value + e.changeY);
    })
    .onEnd((e) => {
      const shouldClose =
        dragY.value > panelHeight.value * 0.33 || e.velocityY > 900;
      if (shouldClose) {
        dragY.value = withTiming(panelHeight.value, { duration: 160 }, () => {
          runOnJS(onClose)();
        });
      } else {
        dragY.value = withSpring(0, { damping: 22, stiffness: 260 });
      }
    });

  // Guard: only ever apply a lift/clamp while the sheet is actually open, so
  // a stale height from a previous session can't affect the next open.
  const kb = open ? kbHeight : 0;

  // When the keyboard opens over the sheet, bring the focused field into
  // view. In every sheet form the text inputs sit at/near the bottom of the
  // content, and RN's ScrollView does NOT auto-scroll to a focused TextInput
  // inside a <Modal> (no `adjustResize`), so the field would stay hidden
  // behind the keyboard until you scrolled by hand.
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (kb <= 0) return;
    const t = setTimeout(
      () => scrollRef.current?.scrollToEnd({ animated: true }),
      Platform.OS === "ios" ? 60 : 140,
    );
    return () => clearTimeout(t);
  }, [kb]);

  // Space available for the panel above the keyboard (and below the status
  // bar). The panel is lifted by `kb` so its footer sits just above the
  // keyboard; its max-height is clamped to what's left so the header never
  // runs off the top.
  const available = Math.max(220, height - kb - insets.top - 8);
  const maxHeight = Math.min(height * maxHeightRatio, available);
  const minHeight =
    minHeightRatio != null
      ? Math.min(maxHeight, height * minHeightRatio)
      : undefined;

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1, justifyContent: "flex-end" }}>
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: c.overlay,
            },
            scrimStyle,
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={{ flex: 1 }}
          />
        </Animated.View>

        <Animated.View
          onLayout={(e) => {
            panelHeight.value = e.nativeEvent.layout.height;
          }}
          className="rounded-t-2xl border-t border-border bg-popover"
          style={[
            { maxHeight, marginBottom: kb },
            minHeight != null ? { minHeight } : null,
            shadow.sheet,
            dragStyle,
          ]}
        >
          <GestureDetector gesture={dragGesture}>
            <View>
              <View
                accessible
                accessibilityLabel="Drag down to close"
                className="items-center pb-1 pt-3"
              >
                <View className="h-1 w-10 rounded-full bg-border" />
              </View>

              {title ? (
                <View className="flex-row items-center gap-2 border-b border-border px-4 pb-3 pt-1">
                  {onBack ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Back"
                      onPress={onBack}
                      hitSlop={8}
                    >
                      <Icon name="chevron-back" size={22} tone="foreground" />
                    </Pressable>
                  ) : null}
                  <SectionTitle className="flex-1">{title}</SectionTitle>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    onPress={onClose}
                    hitSlop={8}
                  >
                    <Icon name="close" size={22} tone="muted" />
                  </Pressable>
                </View>
              ) : null}
            </View>
          </GestureDetector>

          <ScrollView
            ref={scrollRef}
            style={minHeight != null ? { flexGrow: 1 } : undefined}
            contentContainerStyle={{
              padding: 16,
              paddingBottom: 16 + (footer ? 0 : insets.bottom),
            }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          {footer ? (
            <View
              className="border-t border-border px-4 pt-4"
              style={{
                paddingBottom: 16 + (kb > 0 ? 4 : insets.bottom),
              }}
            >
              {footer}
            </View>
          ) : null}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}
