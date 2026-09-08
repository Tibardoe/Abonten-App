import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

// One place that owns "is the soft keyboard up, and how tall is it".
//
// iOS emits `keyboardWillShow/Hide` before the animation (smoother to react
// to); Android only emits `keyboardDidShow/Hide`.
//
// Extracted from Sheet.tsx so the chat composer, sticky bottom CTAs and the
// bottom sheet all read the same signal instead of each re-implementing the
// listeners.

export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = Keyboard.addListener(showEvt, (e) =>
      setHeight(e.endCoordinates?.height ?? 0),
    );
    const onHide = Keyboard.addListener(hideEvt, () => setHeight(0));

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  return height;
}

export function useKeyboardVisible(): boolean {
  return useKeyboardHeight() > 0;
}
