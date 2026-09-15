import { useCallback, useRef } from "react";
import { Platform } from "react-native";

// Sequencing for "close this modal, THEN open that one".
//
// RN's <Modal> is a real presented view controller on iOS. Flipping one
// modal's `visible` to false and another's to true in the same render asks
// UIKit to dismiss a controller while presenting a new one on top of it.
// The new one is presented from the controller that is mid-dismissal, and
// the two operations race: sometimes the second modal is torn down with the
// first, sometimes its transparent host window is left behind, still the
// key window, swallowing every touch. The app then looks frozen until it is
// force-quit. Seen on device from Explore › Set your location › Choose on
// map › back (two modals closed at once), and the same shape exists wherever
// a menu or viewer opens a sheet.
//
// The fix is to wait: keep the follow-up in a ref, close the first modal,
// and run the follow-up from that modal's `onDismiss`, which fires only
// once the native dismissal has finished. `<Sheet>` exposes `onDismiss` (on
// both platforms) for exactly this.
//
//   const handoff = useModalHandoff();
//   <Sheet open={open} onClose={close} onDismiss={handoff.onDismiss}>
//     <Row onPress={() => { handoff.after(() => setMapOpen(true)); close(); }} />
//   </Sheet>
//
// For a modal that UNMOUNTS when it closes (an overlay that renders null
// while hidden) there is no `onDismiss` to hook; `runAfterModalDismissal`
// defers the follow-up past the length of a native dismissal instead.

export function useModalHandoff() {
  const pending = useRef<(() => void) | null>(null);

  /** Queue `fn` to run once the modal has fully dismissed. */
  const after = useCallback((fn: () => void) => {
    pending.current = fn;
  }, []);

  /** Wire this to the modal's `onDismiss`. */
  const onDismiss = useCallback(() => {
    const fn = pending.current;
    pending.current = null;
    fn?.();
  }, []);

  /** Drop a queued follow-up (e.g. the modal was closed some other way). */
  const cancel = useCallback(() => {
    pending.current = null;
  }, []);

  return { after, onDismiss, cancel };
}

// iOS dismisses a presented controller asynchronously even with no
// animation; ~350ms comfortably outlasts the default slide. Android's
// dialog is gone the moment `visible` flips, so nothing to wait for.
const IOS_DISMISSAL_MS = 350;

/** Run `fn` after a modal that is closing right now has left the screen. */
export function runAfterModalDismissal(fn: () => void): void {
  if (Platform.OS === "ios") setTimeout(fn, IOS_DISMISSAL_MS);
  else setTimeout(fn, 0);
}
