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
  useAnimatedReaction,
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

// Native echo of apps/web/src/components/atoms/BottomSheet.tsx — the surface
// the web app uses for the filter modal, date pickers, and anchored menus.
// Same prop shape (`open` / `onClose` / `title` / `footer`) so those flows
// port across. Built on RN's Modal so it needs no extra dependency.
//
// Keyboard handling: the PANEL NEVER MOVES.
//
// Neither Android's `windowSoftInputMode=adjustResize` nor iOS's
// `automaticallyAdjustKeyboardInsets` reaches content inside a RN <Modal>
// (it is a separate native window), so the sheet has to inset itself. The
// previous version did that by lifting the whole panel — `marginBottom` =
// keyboard height — and by re-deriving its max/min height from
// `windowHeight - keyboardHeight`. Focusing the search field in the location
// sheet therefore translated AND resized the panel in one go: it flew up the
// screen and changed detent just because a keyboard appeared.
//
// Now the panel's frame is held still and only its INTERIOR reflows:
//
//   • max/min height come from the full window, never minus the keyboard,
//     so the detent the sheet opened at is the detent it keeps.
//   • the moment the keyboard starts coming up the panel's height is pinned
//     to the height it had at rest, so the inset below cannot grow it.
//   • an interior spacer at the very bottom of the panel — the last child,
//     entirely behind the keyboard and therefore invisible — takes the
//     keyboard's height. The scroll view (the only flexible child) shrinks
//     by exactly that much and the footer rides just above the keys. The
//     panel's top edge, height, corners, backdrop and drag are untouched.
//   • the spacer is driven by `useAnimatedKeyboard`, i.e. the platform's own
//     keyboard inset read on the UI thread, so the content settles frame by
//     frame WITH the keyboard rather than jumping after it.
//   • the focused field is then scrolled into the remaining window by the
//     shared reveal engine (useKeyboardReveal.ts) — the same one the
//     full-screen forms use, reached by <Input> through the context below.
//
// No keyboard height is ever measured, guessed or hard-coded here, and the
// panel is never translated by one.
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
    setRestingHeight(null);
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

  // Guard: only ever react to the keyboard while the sheet is actually open,
  // so a stale height from a previous session can't affect the next open.
  const kb = open ? kbHeight : 0;

  // The keyboard's overlap with the bottom of the window, read from the
  // platform on the UI thread. The translucent flags match the app's
  // edge-to-edge window (android/gradle.properties edgeToEdgeEnabled=true)
  // and this Modal's `statusBarTranslucent`: the panel is anchored to the
  // PHYSICAL bottom edge, so the overlap has to be measured from there too —
  // without them Android reports the IME height minus the navigation bar and
  // the spacer comes up short.
  const liveKeyboard = useAnimatedKeyboard({
    isStatusBarTranslucentAndroid: true,
    isNavigationBarTranslucentAndroid: true,
  });

  // Is the keyboard on its way up? Taken from the UI-thread value so it
  // flips on the FIRST frame of the keyboard animation — Android's JS
  // `keyboardDidShow` only lands once the keyboard has finished, which would
  // let the panel grow for the whole animation before being pinned.
  const [keyboardUp, setKeyboardUp] = useState(false);
  useAnimatedReaction(
    () => liveKeyboard.height.value > 0,
    (up, prev) => {
      if (up !== prev) runOnJS(setKeyboardUp)(up);
    },
  );
  const kbOpen = open && (keyboardUp || kb > 0);

  // The panel's height at rest, i.e. as laid out with the keyboard down.
  // While the keyboard is up the panel is pinned to it so the interior
  // spacer shrinks the scroll view instead of growing the sheet.
  const [restingHeight, setRestingHeight] = useState<number | null>(null);

  // Height of the interior spacer: the keyboard's overlap, taken from
  // whichever source currently has it. The UI-thread value leads the
  // animation; the JS one is a floor for the case where a platform reports
  // the inset late or not at all inside a Modal. Both describe the SAME
  // quantity — this is not a second keyboard system, just the better of two
  // readings of one.
  const keyboardInsetStyle = useAnimatedStyle(() => {
    if (!open) return { height: 0 };
    return { height: Math.max(liveKeyboard.height.value, kb) };
  });

  // Scroll the focused field into whatever room is left above the keyboard,
  // using the engine the full-screen forms share. <Input> reports its focus
  // through the context provided around the scroll view below.
  const scrollRef = useRef<ScrollView>(null);
  const { context: revealContext, trackScroll } = useKeyboardReveal({
    scrollRef,
    keyboardHeight: kb,
  });

  // Space available for the panel: the whole window below the status bar.
  // Deliberately NOT reduced by the keyboard — that is what used to change
  // the sheet's detent the moment an input was focused.
  const available = Math.max(220, height - insets.top - 8);
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
      onRequestClose={() => {
        // Android hardware / gesture back. With the keyboard up, back means
        // "put the keyboard away" — closing the sheet and losing a
        // half-typed form is not what the gesture asked for. A second back
        // then closes the sheet as usual. (Inside a Modal the dialog can
        // consume the key before the IME does, so this is explicit.)
        if (kbOpen) {
          Keyboard.dismiss();
          return;
        }
        onClose();
      }}
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
            const h = e.nativeEvent.layout.height;
            panelHeight.value = h;
            // Remember the resting height only while the keyboard is down —
            // that is the height the panel must keep once it comes up. (If
            // the sheet were ever laid out for the first time with the
            // keyboard already showing there is no resting height to
            // preserve, so it simply sizes itself as usual.)
            if (!kbOpen && h > 0 && h !== restingHeight) setRestingHeight(h);
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
            // Pinned while the keyboard is up: the interior spacer below
            // then shrinks the scroll view instead of stretching the sheet.
            kbOpen && restingHeight != null ? { height: restingHeight } : null,
            shadow.sheet,
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

          <KeyboardAwareContext.Provider value={revealContext}>
            <ScrollView
              ref={scrollRef}
              // `flexShrink` is what lets the keyboard spacer below take its
              // room from the CONTENT: the scroll view is the panel's only
              // flexible child, so it is the only thing that gives way.
              style={[
                { flexShrink: 1 },
                minHeight != null ? { flexGrow: 1 } : null,
              ]}
              contentContainerStyle={{
                padding: 16,
                paddingBottom: 16 + (footer ? 0 : insets.bottom),
              }}
              keyboardShouldPersistTaps="handled"
              // Dragging the content puts the keyboard away, the same
              // gesture the full-screen forms use.
              keyboardDismissMode={
                Platform.OS === "ios" ? "interactive" : "on-drag"
              }
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
                // With the keyboard up the home-indicator / gesture strip is
                // behind the keys, so the safe-area inset would only add a
                // dead band between the footer and the keyboard.
                paddingBottom: 16 + (kbOpen ? 4 : insets.bottom),
              }}
            >
              {footer}
            </View>
          ) : null}

          {/* Keyboard inset. Last child, so it sits at the very bottom of
              the panel — entirely behind the keyboard and never seen. */}
          <Animated.View pointerEvents="none" style={keyboardInsetStyle} />
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}
