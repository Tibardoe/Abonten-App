import { useCallback, useRef } from "react";
import { Keyboard, type View } from "react-native";
import type { Rect } from "./menuPlacement";

// Longest the settle loop will follow a moving layout: about a second at
// 60 fps. A keyboard hide animation takes roughly a quarter of that.
const MAX_SETTLE_FRAMES = 60;
// Two readings this close are the same position (sub-pixel rounding).
const SETTLED_DP = 0.5;

// Attach `ref` to the pressable surface; call `measure()` from a long-press
// handler to get its window rect for an anchored overlay. measureInWindow
// gives coordinates relative to the whole window (what an overlay filling the
// window needs), unlike `measure()` which is relative to the nearest
// ancestor.
//
// The rect is taken where the item will REST. Every anchored overlay puts the
// keyboard away as it opens, and the screen under it moves as the keyboard
// leaves (a chat thread's KeyboardInsetView shrinks back to the bottom edge).
// Measured while the keyboard was up, the lifted copy of a message was drawn
// a keyboard-height above the bubble it stood for.
//
// Waiting for the platform's "keyboard hidden" event is not enough on its
// own: on Android it arrives before the inset animation driven from the
// UI thread has finished (measured on device: 394.8 dp at the event, 565 dp
// at rest). So after the event this follows the item frame by frame and
// resolves once two consecutive readings agree -- the layout has stopped
// moving -- with MAX_SETTLE_FRAMES as the ceiling. Nothing is timed.
//
// It also means an overlay that is still an RN <Modal> (the header's
// anchored menu) never opens while the keyboard is moving (see
// useKeyboardLift).
export function useAnchorMeasure() {
  const ref = useRef<View>(null);

  const measureNow = useCallback(
    () =>
      new Promise<Rect | null>((resolve) => {
        const node = ref.current;
        if (!node) return resolve(null);
        node.measureInWindow((x, y, width, height) => {
          if (
            [x, y, width, height].some((n) => typeof n !== "number") ||
            width <= 0
          ) {
            return resolve(null);
          }
          resolve({ x, y, width, height });
        });
      }),
    [],
  );

  const measureWhenSettled = useCallback(
    () =>
      new Promise<Rect | null>((resolve) => {
        let previous: Rect | null = null;
        let frames = 0;
        const step = () => {
          void measureNow().then((rect) => {
            frames += 1;
            const settled =
              !!rect &&
              !!previous &&
              Math.abs(rect.y - previous.y) < SETTLED_DP &&
              Math.abs(rect.x - previous.x) < SETTLED_DP;
            if (!rect || settled || frames >= MAX_SETTLE_FRAMES) {
              resolve(rect);
              return;
            }
            previous = rect;
            requestAnimationFrame(step);
          });
        };
        requestAnimationFrame(step);
      }),
    [measureNow],
  );

  const measure = useCallback((): Promise<Rect | null> => {
    if (!Keyboard.isVisible()) return measureNow();
    return new Promise((resolve) => {
      const sub = Keyboard.addListener("keyboardDidHide", () => {
        sub.remove();
        void measureWhenSettled().then(resolve);
      });
      Keyboard.dismiss();
    });
  }, [measureNow, measureWhenSettled]);

  return { ref, measure };
}
