import { useAnimatedKeyboard } from "react-native-reanimated";

// The soft keyboard's height as a UI-thread shared value that moves WITH the
// keyboard, frame by frame, on both platforms — the ONE keyboard signal every
// animated surface in the app reads (bottom sheets, the chat thread, the
// sticky bottom bars, the Spotlight comments panel, the Story reply bar).
//
// `useKeyboardHeight` (same folder) is a JS listener: on Android it only hears
// `keyboardDidShow`, i.e. after the keyboard has finished sliding in, so
// anything laid out from it jumps a beat late — the keyboard covers the
// field, then the field leaps up. That is also what React Native's own
// KeyboardAvoidingView does on Android, which is why it is not used anywhere
// in the app any more. Reanimated reads the platform's inset animation
// directly, so a surface driven by this value rides on top of the keyboard as
// one motion. Keep `useKeyboardHeight` for plain JS decisions (is a field
// focused, which way does Back go), never for anything that moves.
//
// The app is edge-to-edge on Android (react-native-edge-to-edge via Expo; the
// IME does not resize the window), and Reanimated detects that itself: the
// height is measured from the physical bottom edge, the same edge every
// bottom-anchored surface is laid out from. The `is*TranslucentAndroid`
// options are ignored in that configuration (Reanimated warns at runtime if
// they are passed), so none are.
//
// Inside an RN <Modal> (a separate native window) this reports a constant
// zero — measured on device — which is the reason sheets render through a
// portal instead (see Sheet.tsx).
export function useKeyboardLift() {
  return useAnimatedKeyboard();
}
