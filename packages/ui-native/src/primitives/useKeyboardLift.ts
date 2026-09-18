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
// THE ONE RULE THAT KEEPS THIS SIGNAL TRUE: nothing that can be on screen
// while the keyboard is moving may be an RN <Modal>. A Modal is a separate
// native window, and the platform delivers the keyboard's inset animation to
// whichever window is on top. Inside a Modal this reads a constant zero;
// worse, if a Modal opens while the keyboard is closing underneath, the
// activity's window stops receiving frames part-way and this value freezes
// at whatever height it had reached (measured on device: the chat composer
// left floating 122 dp above an empty bottom edge after a message
// long-press, when that overlay was still a Modal). Sheets, the message
// action overlay and every other keyboard-adjacent surface therefore render
// through @gorhom/portal into the app's own window instead.
export function useKeyboardLift() {
  return useAnimatedKeyboard();
}
