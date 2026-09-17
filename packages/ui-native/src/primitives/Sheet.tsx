import { Portal } from "@gorhom/portal";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  BackHandler,
  Keyboard,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
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
import { KeyboardAwareContext, useKeyboardReveal } from "./useKeyboardReveal";

// The app's bottom sheet. It renders through a PORTAL into the app's own view
// hierarchy — deliberately NOT an RN <Modal>.
//
// WHY THAT IS THE WHOLE DESIGN. A Modal is a separate native window, and that
// one fact broke every platform mechanism a sheet needs:
//
//   • Android's `windowSoftInputMode=adjustResize` (set in our manifest) does
//     not apply inside it.
//   • iOS's `automaticallyAdjustKeyboardInsets` does not apply inside it.
//   • Reanimated's `useAnimatedKeyboard` watches the activity's insets, so
//     inside a Modal it reports a constant zero — measured on device here.
//   • the app-root <GestureHandlerRootView> does not reach inside it.
//
// So the old sheet had to re-implement keyboard handling from JS listeners,
// and it showed: focusing the location sheet's field lifted the whole panel by
// `marginBottom` = keyboard height AND re-derived its max/min height from
// `windowHeight - keyboardHeight`, so the sheet flew up the screen and changed
// size at once (its top edge jumped y=1140 -> y=748 on a test device). Fixes
// in that direction were heuristics on a broken foundation — the panel's own
// "natural" height even re-measured differently between layout passes.
//
// Out of the Modal the platform does the work again. The keyboard is read with
// `useAnimatedKeyboard`, which now reports properly, so the panel rides it
// frame by frame ON THE UI THREAD rather than being animated after the fact
// from a JS listener. This is the same approach the Spotlight comments panel
// and the Story reply bar already use, for the same stated reason — both avoid
// <Modal> "so the composer rides the keyboard".
//
// (The obvious alternative, @gorhom/bottom-sheet, is the industry standard and
// was tried first. Its v5 is written for Reanimated 3 and does not work on
// Reanimated 4 / Expo SDK 57: `present()` is called, no `onChange` fires and
// nothing renders — a known upstream bug, gorhom issues #2546 / #2528 / #2592.
// Only its portal package, which has no Reanimated dependency, is used here.)
//
// KEYBOARD. A sheet moves only if it has to. It rises when something at its
// bottom edge must stay usable — a footer's action, or the content itself in a
// sheet that hugs its content — and then only by the keyboard's height,
// clamped so its top can never run past the status bar. A tall sheet whose
// content sits at the top (the location picker) does not move at all; the
// keyboard simply covers its empty lower part. Whatever the movement does not
// cover is handled by scrolling the focused field into view
// (useKeyboardReveal, the same engine the full-screen forms use). The panel's
// HEIGHT is never re-derived from the keyboard, so a sheet always keeps the
// size it opened at.
//
// Dismissal: tap the scrim, tap the X, hardware back, or drag the grab handle
// down. Back drops the keyboard first when it is up, so a half-typed form is
// not thrown away by a gesture that only meant "hide the keys". The pan
// gesture is bound to the handle + title bar ONLY, never to the scrolling
// content: a sheet is often a form or a long option list, and a whole-panel
// drag would fight the ScrollView and swallow taps on inputs.
//
// REQUIREMENT: <PortalProvider> must wrap the app — see app/_layout.tsx.

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  /**
   * Fires once the sheet has FULLY left the screen. Open another modal /
   * sheet / viewer from here, never from `onClose` — see useModalHandoff.ts
   * for why presenting one while another is still dismissing freezes iOS.
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

  const dragY = useSharedValue(0);
  const panelHeight = useSharedValue(0);
  // 0 = off screen, 1 = presented. Drives the panel slide AND the scrim fade.
  const presence = useSharedValue(0);
  // Stays mounted while the exit animation runs.
  const [mounted, setMounted] = useState(open);

  // The keyboard, read on the UI thread. The translucent flags match the app's
  // edge-to-edge window, where the IME does NOT resize the window, so the
  // overlap has to be measured from the physical bottom edge — the same edge
  // this panel is anchored to.
  const keyboard = useAnimatedKeyboard({
    isStatusBarTranslucentAndroid: true,
    isNavigationBarTranslucentAndroid: true,
  });

  // JS-side height, for the parts that are plain layout rather than animation.
  const kbHeight = useKeyboardHeight();
  const keyboardUp = mounted && kbHeight > 0;

  useEffect(() => {
    // A sheet closed while its field was focused would otherwise leave the
    // keyboard up over whatever is underneath.
    if (!open) Keyboard.dismiss();
  }, [open]);

  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const wasMounted = useRef(mounted);
  useEffect(() => {
    const closed = wasMounted.current && !mounted;
    wasMounted.current = mounted;
    if (closed) onDismissRef.current?.();
  }, [mounted]);

  const finishExit = useCallback(() => setMounted(false), []);
  const enterDuration = reduceMotion ? 0 : 280;
  const exitDuration = reduceMotion ? 0 : 220;

  // Opening mounts the surface with the panel parked below the screen and
  // slides it in once the panel has been measured, so the travel is the
  // panel's own height and short sheets don't lag. Closing animates out FIRST
  // and only then unmounts. Reopening mid-exit reverses the animation.
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

  // Android hardware / gesture back. With the keyboard up, back means "put the
  // keyboard away" — losing a half-typed form is not what the gesture asked
  // for. A second back then closes the sheet. (An RN <Modal> used to give us
  // this for free through `onRequestClose`.)
  useEffect(() => {
    if (!mounted) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (kbHeight > 0) {
        Keyboard.dismiss();
        return true;
      }
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [mounted, kbHeight, onClose]);

  // How far the panel may rise before its top edge would pass under the status
  // bar. Whatever the keyboard covers beyond that is handled by scrolling the
  // focused field instead.
  const topLimit = insets.top + 8;

  // Does this sheet need to rise at all? Only if something that must stay
  // usable lives at its bottom edge:
  //   • a footer — its action has to clear the keys;
  //   • a sheet with no `minHeightRatio`, which hugs its content, so its
  //     bottom edge IS content.
  // A tall sheet whose content sits at the top (the location picker) is left
  // exactly where it is and the keyboard simply covers its empty lower part —
  // no movement at all, which is what a sheet should do when it can.
  const liftsForKeyboard = footer != null || minHeightRatio == null;

  const liftStyle = useAnimatedStyle(() => {
    const room = Math.max(0, height - panelHeight.value - topLimit);
    const lift = liftsForKeyboard ? Math.min(keyboard.height.value, room) : 0;
    // Until measured, park a full window height down so the panel can never
    // flash at its resting position for a frame.
    const travel = panelHeight.value > 0 ? panelHeight.value + 24 : height;
    return {
      transform: [
        { translateY: (1 - presence.value) * travel + dragY.value - lift },
      ],
    };
  });

  // The scrim fades with the presentation and thins as the panel is dragged
  // away, so the gesture reads as letting go of this screen rather than a
  // panel sliding over a constant wall of grey.
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
      // A third of the panel, or a flick. With the keyboard up the panel has
      // been lifted clear of it, so the whole panel is still reachable and no
      // keyboard-aware adjustment is needed here.
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

  // Scroll the focused field into whatever the lift could not cover, using the
  // engine the full-screen forms share.
  const scrollRef = useRef<ScrollView>(null);
  const { context: revealContext, trackScroll } = useKeyboardReveal({
    scrollRef,
    keyboardHeight: kbHeight,
  });

  // Deliberately NOT reduced by the keyboard: that is what used to change the
  // sheet's size the moment a field was focused.
  const available = Math.max(220, height - topLimit);
  const maxHeight = Math.min(height * maxHeightRatio, available);
  const minHeight =
    minHeightRatio != null
      ? Math.min(maxHeight, height * minHeightRatio)
      : undefined;

  if (!mounted) return null;

  return (
    <Portal>
      <View
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          justifyContent: "flex-end",
        }}
      >
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

          <KeyboardAwareContext.Provider value={revealContext}>
            <ScrollView
              ref={scrollRef}
              style={[
                { flexShrink: 1 },
                minHeight != null ? { flexGrow: 1 } : null,
              ]}
              contentContainerStyle={{
                padding: 16,
                paddingBottom: 16 + (footer ? 0 : insets.bottom),
              }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onScroll={trackScroll}
              scrollEventThrottle={32}
            >
              {children}
            </ScrollView>
          </KeyboardAwareContext.Provider>

          {footer ? (
            <View
              className="border-t border-border px-4 pt-4"
              style={{
                // With the keyboard up the panel has been lifted onto it, so
                // the home-indicator inset would only add a dead band.
                paddingBottom: 16 + (keyboardUp ? 4 : insets.bottom),
              }}
            >
              {footer}
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Portal>
  );
}
