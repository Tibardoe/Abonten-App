import { useAnimatedKeyboard } from "react-native-reanimated";

// The soft keyboard's height as a UI-thread shared value that moves WITH the
// keyboard, frame by frame, on both platforms.
//
// `useKeyboardHeight` (ui-native) is a JS listener: on Android it only hears
// `keyboardDidShow`, i.e. after the keyboard has finished sliding in, so a
// bar lifted from it jumps a beat late — the keyboard covers the field, then
// the field leaps up. Reanimated reads the platform's inset animation
// directly, so a composer translated by this value rides on top of the
// keyboard as one motion. The app is edge-to-edge on Android (the IME does
// not resize the window), hence both translucent flags: the height is then
// measured from the physical bottom edge, the same edge our overlays anchor
// to.
//
// Used where a bottom-anchored input lives in the main window: Spotlight
// comments and the Story reply bar.
export function useKeyboardLift() {
  return useAnimatedKeyboard({
    isStatusBarTranslucentAndroid: true,
    isNavigationBarTranslucentAndroid: true,
  });
}
