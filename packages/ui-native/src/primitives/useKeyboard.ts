import { useEffect, useState } from "react";
import {
  Dimensions,
  Keyboard,
  type KeyboardEvent,
  Platform,
} from "react-native";

// One place that owns "is the soft keyboard up, and how tall is it".
//
// iOS emits `keyboardWillShow/Hide` before the animation (smoother to react
// to); Android only emits `keyboardDidShow/Hide`.
//
// On iOS the keyboard's frame also changes WITHOUT a show/hide pair: the
// predictive-text bar toggles, a paste raises the QuickType bar, a hardware
// keyboard collapses it to a strip, the emoji keyboard is a different
// height. Those arrive as `keyboardWillChangeFrame`. Reading only show/hide
// left a stale height behind — a chat composer padded for a keyboard that
// had since shrunk, i.e. a blank band above the keys. So the height is
// derived from the END frame's screen Y on every event: the overlap with the
// window is `window height − keyboard top`, which is exactly right for the
// floating / undocked keyboard case too (it reports a frame below the
// window, hence the clamp to zero).
//
// Extracted from Sheet.tsx so the chat composer, sticky bottom CTAs and the
// bottom sheet all read the same signal instead of each re-implementing the
// listeners.

function overlapFor(e: KeyboardEvent): number {
  const end = e.endCoordinates;
  if (!end) return 0;
  if (Platform.OS === "ios") {
    const windowHeight = Dimensions.get("window").height;
    return Math.max(0, Math.round(windowHeight - end.screenY));
  }
  return Math.max(0, Math.round(end.height));
}

export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = Keyboard.addListener(showEvt, (e) =>
      setHeight(overlapFor(e)),
    );
    const onHide = Keyboard.addListener(hideEvt, () => setHeight(0));
    const onFrame =
      Platform.OS === "ios"
        ? Keyboard.addListener("keyboardWillChangeFrame", (e) =>
            setHeight(overlapFor(e)),
          )
        : null;

    return () => {
      onShow.remove();
      onHide.remove();
      onFrame?.remove();
    };
  }, []);

  return height;
}

export function useKeyboardVisible(): boolean {
  return useKeyboardHeight() > 0;
}
