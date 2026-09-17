import {
  type RefObject,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  type ScrollView,
  TextInput,
} from "react-native";

// The "keep the focused field visible above the keyboard" engine.
//
// It is deliberately ONE implementation shared by the two scroll containers
// that need it, so the app never grows a second keyboard system:
//   • <KeyboardAwareScrollView> — full-screen forms.
//   • <Sheet>                   — bottom sheets. Those render into an RN
//     <Modal>, i.e. a separate native window, where neither Android's
//     `adjustResize` nor iOS's `automaticallyAdjustKeyboardInsets` reaches
//     the content, so the sheet insets its own content and then asks this
//     engine to scroll the focused field into what is left.
//
// Why reveal is done here rather than left to the platform: RN's own iOS
// nudge (RCTScrollView `_keyboardWillChangeFrame`) only runs on a keyboard
// frame change, and only brings the field's bottom edge flush with the
// keyboard's top — so a tall Bio box had a sliver showing, moving focus
// between fields with the keyboard already up did nothing at all, and a
// multiline field growing under the keyboard was never followed.
//
// Every <Input> reports its focus (and, while focused, its growth) through
// the context below; the engine measures the field in window coordinates
// against the keyboard's top edge and scrolls just enough to keep the whole
// field, plus a comfortable margin, in view. It only ever scrolls the
// CONTENT — it never moves, resizes or re-positions the container.

export type Measurable = {
  measureInWindow: (
    cb: (x: number, y: number, width: number, height: number) => void,
  ) => void;
};

export type KeyboardAwareContextValue = {
  /** Bring this field into view above the keyboard (called by <Input>). */
  revealInput: (node: Measurable | null) => void;
  /**
   * Register a <KeyboardRevealGroup>: a focused field inside its frame is
   * revealed together with the whole group. Returns the unregister function.
   */
  registerGroup: (node: Measurable | null) => () => void;
};

export const KeyboardAwareContext =
  createContext<KeyboardAwareContextValue | null>(null);

/** How much of the field's surroundings to keep visible past its edges. */
const REVEAL_MARGIN = 24;

export type KeyboardRevealOptions = {
  /** The scroller whose content is scrolled to reveal the focused field. */
  scrollRef: RefObject<ScrollView | null>;
  /**
   * Keyboard overlap with the bottom of the window, in px. Zero while the
   * keyboard is down, which disables the engine entirely.
   */
  keyboardHeight: number;
};

export type KeyboardRevealResult = {
  /** Provide this on <KeyboardAwareContext.Provider>. */
  context: KeyboardAwareContextValue;
  /** Chain this into the scroller's `onScroll`. */
  trackScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
};

export function useKeyboardReveal({
  scrollRef,
  keyboardHeight,
}: KeyboardRevealOptions): KeyboardRevealResult {
  // Live scroll offset — `scrollTo` needs an absolute content offset, and the
  // field is measured in window space, so the two are combined here.
  const offsetY = useRef(0);
  const trackScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetY.current = e.nativeEvent.contentOffset.y;
    },
    [],
  );

  const kbRef = useRef(0);
  kbRef.current = keyboardHeight;
  const focusedRef = useRef<Measurable | null>(null);
  const groupsRef = useRef<Set<Measurable>>(new Set());

  const reveal = useCallback(
    async (node: Measurable | null) => {
      const scroller = scrollRef.current;
      const kb = kbRef.current;
      if (!node || !scroller || kb <= 0) return;
      const scrollerNode = scroller as unknown as Measurable;
      let { y, h } = await measure(node);
      // Inside a registered group? Reveal the group (field + its action).
      for (const group of groupsRef.current) {
        const g = await measure(group);
        const mid = y + h / 2;
        if (g.h > 0 && mid >= g.y && mid <= g.y + g.h) {
          y = g.y;
          h = g.h;
          break;
        }
      }
      const view = await measure(scrollerNode);
      const windowH = Dimensions.get("window").height;
      const keyboardTop = windowH - kb;
      // The visible window of the scroller: its top edge down to whichever is
      // higher, its own bottom or the keyboard's top. (In a sheet the
      // scroller has already been inset clear of the keyboard, so its own
      // bottom wins there — the same maths covers both containers.)
      const visibleTop = view.y;
      const visibleBottom = Math.min(view.y + view.h, keyboardTop);
      const fieldTop = y;
      const fieldBottom = y + h;
      let delta = 0;
      if (fieldBottom + REVEAL_MARGIN > visibleBottom) {
        delta = fieldBottom + REVEAL_MARGIN - visibleBottom;
      }
      // A field taller than the visible window: favour its top so the label
      // and first lines are readable, never the bottom edge alone.
      if (fieldTop - delta < visibleTop + REVEAL_MARGIN) {
        delta = fieldTop - (visibleTop + REVEAL_MARGIN);
      }
      if (Math.abs(delta) < 2) return;
      scroller.scrollTo({
        y: Math.max(0, offsetY.current + delta),
        animated: true,
      });
    },
    [scrollRef],
  );

  // A field took focus (or, while focused, grew). Wait for the keyboard
  // height and the container's new layout to land before measuring.
  const revealInput = useCallback(
    (node: Measurable | null) => {
      focusedRef.current = node;
      // Android: the keyboard-did-show event and the container's inset land
      // well after focus, so measure late enough to see the final viewport
      // (an early measure revealed only the field's top).
      const t = setTimeout(
        () => void reveal(node),
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
    if (keyboardHeight <= 0) return;
    const t = setTimeout(
      () =>
        void reveal(
          // The field that has focus right now — found through the platform
          // so a raw TextInput (which never reports focus) is covered —
          // else the last <Input> that reported it.
          (TextInput.State.currentlyFocusedInput() as unknown as Measurable | null) ??
            focusedRef.current,
        ),
      Platform.OS === "ios" ? 60 : 220,
    );
    return () => clearTimeout(t);
  }, [keyboardHeight, reveal]);

  const registerGroup = useCallback((node: Measurable | null) => {
    if (!node) return () => {};
    groupsRef.current.add(node);
    return () => {
      groupsRef.current.delete(node);
    };
  }, []);

  const context = useMemo<KeyboardAwareContextValue>(
    () => ({ revealInput, registerGroup }),
    [revealInput, registerGroup],
  );

  return { context, trackScroll };
}

/**
 * For inputs rendered inside a keyboard-aware container: call the returned
 * function on focus (and on growth while focused) with the TextInput ref.
 * A no-op outside such a container, so <Input> can call it unconditionally.
 */
export function useRevealInput(): KeyboardAwareContextValue["revealInput"] {
  const ctx = useContext(KeyboardAwareContext);
  return ctx?.revealInput ?? noop;
}

function noop() {}

function measure(node: Measurable): Promise<{ y: number; h: number }> {
  return new Promise((resolve) => {
    try {
      node.measureInWindow((_x, y, _w, h) => resolve({ y, h }));
    } catch {
      resolve({ y: 0, h: 0 });
    }
  });
}
