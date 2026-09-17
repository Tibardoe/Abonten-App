import {
  type ReactNode,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import {
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  ScrollView,
  type ScrollViewProps,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardHeight } from "./useKeyboard";
import {
  KeyboardAwareContext,
  type Measurable,
  useKeyboardReveal,
} from "./useKeyboardReveal";

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
// Revealing the FOCUSED field is delegated to the shared engine in
// useKeyboardReveal.ts — the same one <Sheet> uses, so there is exactly one
// implementation of "scroll the focused field above the keyboard" in the app.
//
// `keyboardShouldPersistTaps="handled"` keeps taps on buttons/other fields
// working with the keyboard up; `keyboardDismissMode` lets a drag dismiss it.
//
// NOTE: bottom sheets are a separate case — neither `adjustResize` nor
// `automaticallyAdjustKeyboardInsets` applies inside a RN <Modal>, so
// <Sheet> insets its own content (and shares the reveal engine above).

export type {
  KeyboardAwareContextValue,
  Measurable,
} from "./useKeyboardReveal";
export { KeyboardAwareContext, useRevealInput } from "./useKeyboardReveal";

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

  const kbHeight = useKeyboardHeight();
  const { context, trackScroll } = useKeyboardReveal({
    scrollRef,
    keyboardHeight: kbHeight,
  });

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      trackScroll(e);
      onScroll?.(e);
    },
    [trackScroll, onScroll],
  );

  const scroller = (
    <KeyboardAwareContext.Provider value={context}>
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
 * Keeps a whole GROUP above the keyboard — a field together with the button
 * that submits it — rather than just the focused field.
 *
 * iOS's own nudge and the per-field reveal both stop at the field's bottom
 * edge, so a form whose action sits under its input (sign-in's "Send code",
 * the OTP screen's "Verify") left that action half behind the keyboard.
 * Whenever the container reveals a focused field — an <Input>, or a raw
 * TextInput / the OTP cells found through the platform's focused-input
 * lookup — and that field lies inside a group, the whole group is kept in
 * view instead. Fields outside every group are revealed on their own.
 *
 * Works inside a <Sheet> too: the sheet provides the same context.
 */
export function KeyboardRevealGroup({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const parent = useContext(KeyboardAwareContext);
  const ref = useRef<View>(null);

  useEffect(() => {
    if (!parent) return;
    return parent.registerGroup(ref.current as unknown as Measurable);
  }, [parent]);

  return (
    <View ref={ref} className={className} style={style} collapsable={false}>
      {children}
    </View>
  );
}
