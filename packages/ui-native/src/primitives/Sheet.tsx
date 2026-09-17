import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useReducedMotion,
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
// Presentation: the backdrop FADES and the panel SLIDES, as two separate
// animations. This used to be `<Modal animationType="slide">`, which slides
// the modal's whole window — the dim backdrop included — so opening a sheet
// showed a grey slab rising from the bottom behind the panel (and sinking
// again on close) that read as a second sheet. The Modal now presents with
// no animation of its own and stays mounted until the exit animation has
// finished, so `onDismiss` still means "fully off screen" on both
// platforms.
//
// The panel is wrapped in its own <GestureHandlerRootView>: an RN <Modal>
// renders into a SEPARATE native view hierarchy, so the app-root one in
// app/_layout.tsx does not reach inside it and every gesture here is
// silently dropped without it. (Confirmed on device — the drag simply did
// nothing until this was added.)

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  /**
   * Fires once the sheet has FULLY left the screen (the native dismissal
   * has finished). Open another modal / sheet / viewer from here, never from
   * `onClose` — see useModalHandoff.ts for why presenting one modal while
   * another is still dismissing freezes the app on iOS.
   */
  onDismiss?: () => void;
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
  onDismiss,
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
  const reduceMotion = useReducedMotion();

  // Live drag offset of the panel, and the panel's measured height (the
  // dismissal threshold and the scrim fade are both fractions of it).
  const dragY = useSharedValue(0);
  const panelHeight = useSharedValue(0);
  // 0 = off screen, 1 = presented. Drives the panel slide AND the backdrop
  // fade, each through its own animated style.
  const presence = useSharedValue(0);
  // The native Modal stays visible while the exit animation runs.
  const [mounted, setMounted] = useState(open);

  // Live keyboard height, from the shared listener hook.
  const kbHeight = useKeyboardHeight();
  useEffect(() => {
    // Every time the sheet closes, drop the keyboard — otherwise a sheet
    // dismissed while its input was focused can leave the keyboard up over
    // the next screen.
    if (!open) Keyboard.dismiss();
  }, [open]);

  // `Modal.onDismiss` is iOS-only (it fires once UIKit has removed the
  // presented controller). On Android the dialog is gone as soon as
  // `visible` flips, so report it when the native Modal is unmounted after
  // the exit animation — same "fully off screen" contract on both
  // platforms.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const wasMounted = useRef(mounted);
  useEffect(() => {
    const closed = wasMounted.current && !mounted;
    wasMounted.current = mounted;
    if (closed && Platform.OS !== "ios") onDismissRef.current?.();
  }, [mounted]);

  const finishExit = useCallback(() => setMounted(false), []);
  const enterDuration = reduceMotion ? 0 : 280;
  const exitDuration = reduceMotion ? 0 : 220;

  // Enter / exit. Opening mounts the Modal with the panel parked below the
  // screen and slides it in once the panel has been measured (onLayout), so
  // the travel is the panel's own height and short sheets don't lag. Closing
  // animates out FIRST and only then unmounts the Modal. Reopening mid-exit
  // simply reverses the animation.
  const pendingEnter = useRef(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      if (panelHeight.value > 0) {
        cancelAnimation(presence);
        presence.value = withTiming(1, {
          duration: enterDuration,
          easing: Easing.out(Easing.cubic),
        });
      } else {
        pendingEnter.current = true;
      }
      return;
    }
    pendingEnter.current = false;
    cancelAnimation(presence);
    presence.value = withTiming(
      0,
      { duration: exitDuration, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(finishExit)();
      },
    );
  }, [open, presence, panelHeight, enterDuration, exitDuration, finishExit]);

  // Fully gone: forget the measured height and any drag, so the next opening
  // parks below the (possibly different) new content and starts undragged.
  useEffect(() => {
    if (mounted) return;
    panelHeight.value = 0;
    dragY.value = 0;
  }, [mounted, panelHeight, dragY]);

  const panelStyle = useAnimatedStyle(() => {
    // Until measured, park the panel a full window height down so it can
    // never flash at its resting position for a frame.
    const travel = panelHeight.value > 0 ? panelHeight.value + 24 : height;
    return {
      transform: [{ translateY: (1 - presence.value) * travel + dragY.value }],
    };
  });

  // The scrim fades with the presentation and thins out as the panel is
  // dragged away, so the gesture reads as letting go of this screen rather
  // than a panel sliding over a constant wall of grey.
  const scrimStyle = useAnimatedStyle(() => {
    const h = panelHeight.value || 1;
    const drag = Math.min(1, Math.max(0, dragY.value / h));
    return { opacity: 0.6 * presence.value * (1 - drag) };
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

  // The lift itself is animated, so the sheet and the keyboard move as one
  // instead of the panel snapping up once the keyboard has finished. Where
  // the platform reports the keyboard frame by frame to this window the
  // live value leads; the JS height (which on Android only arrives after the
  // keyboard is fully open) eases in behind it so it never jumps either.
  const liveKeyboard = useAnimatedKeyboard();
  const settledKb = useSharedValue(0);
  useEffect(() => {
    settledKb.value = reduceMotion
      ? kb
      : withTiming(kb, {
          duration: kb > 0 ? 220 : 180,
          easing: kb > 0 ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        });
  }, [kb, settledKb, reduceMotion]);
  const liftStyle = useAnimatedStyle(() => {
    const live = open ? liveKeyboard.height.value : 0;
    return { marginBottom: Math.max(live, settledKb.value) };
  });

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
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      onDismiss={Platform.OS === "ios" ? onDismiss : undefined}
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
            if (pendingEnter.current) {
              pendingEnter.current = false;
              presence.value = withTiming(1, {
                duration: enterDuration,
                easing: Easing.out(Easing.cubic),
              });
            }
          }}
          className="rounded-t-2xl border-t border-border bg-popover"
          style={[
            { maxHeight },
            minHeight != null ? { minHeight } : null,
            shadow.sheet,
            liftStyle,
            panelStyle,
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
