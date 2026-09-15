import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import {
  Dimensions,
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  ScrollView,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardHeight } from "./useKeyboard";

// The one scroll container every full-screen form in the app should use so a
// focused input is never left behind the keyboard.
//
// How it works, per platform, using only React Native built-ins (no native
// dependency / EAS rebuild):
//   • iOS  — `automaticallyAdjustKeyboardInsets` makes the scroll view inset
//            its content by the keyboard height. No KeyboardAvoidingView
//            (which would double-count against it).
//   • Android — the app runs edge-to-edge
//            (android/gradle.properties edgeToEdgeEnabled=true), and an
//            edge-to-edge window is NOT resized by the IME the way
//            windowSoftInputMode=adjustResize used to be. Nothing moved on
//            its own: on an Android 15 device the keyboard simply covered
//            the bottom of the screen, leaving submit buttons unreachable.
//            So the scroll view is wrapped in a KeyboardAvoidingView with
//            behavior="padding", which shrinks its viewport by the measured
//            keyboard height, and the `paddingBottom` below keeps headroom
//            for the last field.
//
// Revealing the FOCUSED field is done here, not left to the platform. RN's
// own iOS nudge (RCTScrollView `_keyboardWillChangeFrame`) only runs on a
// keyboard frame change, and only brings the field's bottom edge flush with
// the keyboard's top — so a tall Bio box had a sliver showing, moving focus
// between fields with the keyboard already up did nothing at all, and a
// multiline field growing under the keyboard was never followed. Every
// <Input> reports its focus (and, while focused, its growth) through the
// context below; the scroll view measures the field in window coordinates
// against the keyboard's top edge and scrolls just enough to keep the
// whole field, plus a comfortable margin, in view.
//
// `keyboardShouldPersistTaps="handled"` keeps taps on buttons/other fields
// working with the keyboard up; `keyboardDismissMode` lets a drag dismiss it.
//
// NOTE: bottom sheets are a separate case — `adjustResize` does not apply
// inside a RN <Modal>, so <Sheet> keeps its own keyboard handling.

type Measurable = {
  measureInWindow: (
    cb: (x: number, y: number, width: number, height: number) => void,
  ) => void;
};

export type KeyboardAwareContextValue = {
  /** Bring this field into view above the keyboard (called by <Input>). */
  revealInput: (node: Measurable | null) => void;
};

export const KeyboardAwareContext =
  createContext<KeyboardAwareContextValue | null>(null);

/** How much of the field's surroundings to keep visible past its edges. */
const REVEAL_MARGIN = 24;

export type KeyboardAwareScrollViewProps = ScrollViewProps & {
  /**
   * Extra space kept below the content in addition to the bottom safe-area
   * inset — headroom to scroll the final field above the keyboard. Raise it
   * for forms whose last control sits flush against the screen bottom.
   */
  extraKeyboardSpace?: number;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export const KeyboardAwareScrollView = forwardRef<
  ScrollView,
  KeyboardAwareScrollViewProps
>(function KeyboardAwareScrollView(
  {
    children,
    extraKeyboardSpace = 120,
    contentContainerStyle,
    keyboardShouldPersistTaps = "handled",
    keyboardDismissMode = Platform.OS === "ios" ? "interactive" : "on-drag",
    showsVerticalScrollIndicator = false,
    onScroll,
    scrollEventThrottle,
    ...rest
  },
  ref,
) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  useImperativeHandle(ref, () => scrollRef.current as ScrollView, []);

  // Live scroll offset — `scrollTo` needs an absolute content offset, and the
  // field is measured in window space, so the two are combined here.
  const offsetY = useRef(0);
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetY.current = e.nativeEvent.contentOffset.y;
      onScroll?.(e);
    },
    [onScroll],
  );

  const kbHeight = useKeyboardHeight();
  const kbRef = useRef(0);
  kbRef.current = kbHeight;
  const focusedRef = useRef<Measurable | null>(null);

  const reveal = useCallback((node: Measurable | null) => {
    const scroller = scrollRef.current;
    const kb = kbRef.current;
    if (!node || !scroller || kb <= 0) return;
    const scrollerNode = scroller as unknown as Measurable;
    node.measureInWindow((_x, y, _w, h) => {
      scrollerNode.measureInWindow((_sx, sy, _sw, sh) => {
        const windowH = Dimensions.get("window").height;
        const keyboardTop = windowH - kb;
        // The visible window of the scroller: its top edge down to whichever
        // is higher, its own bottom or the keyboard's top.
        const visibleTop = sy;
        const visibleBottom = Math.min(sy + sh, keyboardTop);
        const fieldTop = y;
        const fieldBottom = y + h;
        let delta = 0;
        if (fieldBottom + REVEAL_MARGIN > visibleBottom) {
          delta = fieldBottom + REVEAL_MARGIN - visibleBottom;
        }
        // A field taller than the visible window: favour its top so the
        // label and first lines are readable, never the bottom edge alone.
        if (fieldTop - delta < visibleTop + REVEAL_MARGIN) {
          delta = fieldTop - (visibleTop + REVEAL_MARGIN);
        }
        if (Math.abs(delta) < 2) return;
        scroller.scrollTo({
          y: Math.max(0, offsetY.current + delta),
          animated: true,
        });
      });
    });
  }, []);

  // A field took focus (or, while focused, grew). Wait a frame so the
  // keyboard height from `keyboardWillShow` and the field's new layout have
  // both landed before measuring.
  const revealInput = useCallback(
    (node: Measurable | null) => {
      focusedRef.current = node;
      // Android: the keyboard-did-show event and the KeyboardAvoidingView's
      // padding land well after focus, so measure late enough to see the
      // final viewport (an early measure revealed only the field's top).
      const t = setTimeout(
        () => reveal(node),
        Platform.OS === "ios" ? 80 : 280,
      );
      return () => clearTimeout(t);
    },
    [reveal],
  );

  // The keyboard appeared or changed size while a field was already focused
  // (autoFocus, a keyboard-type switch, the predictive bar toggling) — the
  // field's own focus event has already happened, so re-check from here.
  useEffect(() => {
    if (kbHeight <= 0) return;
    const t = setTimeout(
      () => reveal(focusedRef.current),
      Platform.OS === "ios" ? 60 : 220,
    );
    return () => clearTimeout(t);
  }, [kbHeight, reveal]);

  const ctx = useMemo<KeyboardAwareContextValue>(
    () => ({ revealInput }),
    [revealInput],
  );

  const scroller = (
    <KeyboardAwareContext.Provider value={ctx}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={keyboardDismissMode}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        onScroll={handleScroll}
        scrollEventThrottle={scrollEventThrottle ?? 32}
        contentContainerStyle={[
          { paddingBottom: insets.bottom + extraKeyboardSpace },
          contentContainerStyle,
        ]}
        {...rest}
      >
        {children}
      </ScrollView>
    </KeyboardAwareContext.Provider>
  );

  // iOS already insets the scroll view itself via
  // automaticallyAdjustKeyboardInsets; wrapping it as well would
  // double-count the keyboard.
  if (Platform.OS === "ios") return scroller;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      {scroller}
    </KeyboardAvoidingView>
  );
});

/**
 * For inputs rendered inside a KeyboardAwareScrollView: call the returned
 * function on focus (and on growth while focused) with the TextInput ref.
 * A no-op outside the scroll view, so <Input> can call it unconditionally.
 */
export function useRevealInput(): KeyboardAwareContextValue["revealInput"] {
  const ctx = useContext(KeyboardAwareContext);
  return ctx?.revealInput ?? noop;
}

function noop() {}
