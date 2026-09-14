import { forwardRef } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// The one scroll container every full-screen form in the app should use so a
// focused input is never left behind the keyboard.
//
// How it works, per platform, using only React Native built-ins (no native
// dependency / EAS rebuild):
//   • iOS  — `automaticallyAdjustKeyboardInsets` makes the scroll view inset
//            its content by the keyboard height and reveal the focused field.
//            No KeyboardAvoidingView (which would double-count against it).
//   • Android — the app runs edge-to-edge
//            (android/gradle.properties edgeToEdgeEnabled=true), and an
//            edge-to-edge window is NOT resized by the IME the way
//            windowSoftInputMode=adjustResize used to be. Nothing moved on
//            its own: on an Android 15 device the keyboard simply covered
//            the bottom of the screen, leaving submit buttons unreachable.
//            So the scroll view is wrapped in a KeyboardAvoidingView with
//            behavior="padding", which shrinks its viewport by the measured
//            keyboard height; RN then scrolls the focused TextInput into
//            what is left, and the `paddingBottom` below keeps headroom for
//            the last field.
//
// `keyboardShouldPersistTaps="handled"` keeps taps on buttons/other fields
// working with the keyboard up; `keyboardDismissMode` lets a drag dismiss it.
//
// NOTE: bottom sheets are a separate case — `adjustResize` does not apply
// inside a RN <Modal>, so <Sheet> keeps its own KeyboardAvoidingView.

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
    ...rest
  },
  ref,
) {
  const insets = useSafeAreaInsets();

  const scroller = (
    <ScrollView
      ref={ref}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      contentContainerStyle={[
        { paddingBottom: insets.bottom + extraKeyboardSpace },
        contentContainerStyle,
      ]}
      {...rest}
    >
      {children}
    </ScrollView>
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
