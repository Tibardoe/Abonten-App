import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, type RefreshControlProps, View } from "react-native";
import { useThemeColors } from "../theme/ThemeProvider";

// One themed pull-to-refresh spinner for the whole app.
//
// RN's bare <RefreshControl> draws the OS default: a grey ring on Android
// and a grey spinner on iOS, on a white circle — which is invisible-ish in
// dark mode and looks like a different app from every other loading state.
// This wraps it with the brand colour on both platforms and the card colour
// behind the Android circle, so refreshing reads as the same system as the
// buttons, the progress bars and the skeletons.
//
// It also OWNS the `refreshing` flag. Screens used to bind it to React
// Query's `isRefetching`, which is true for every background refetch — a
// focus refetch, an invalidation after a mutation, the reconnect refetch —
// not just a pull. On iOS, flipping `refreshing` to true programmatically
// makes UIRefreshControl unfurl its spinner and shove the content down, and
// when it flips back the list is frequently left sitting at that offset
// with the spinner still showing: the "hanging spinner" after returning
// from a conversation to the inbox, or from a detail screen to Home. Here
// the spinner shows only while the user's own pull is being served:
// `onRefresh` may return a promise, and the control stays busy until it
// settles (with a short floor so a cached refetch still gives visible
// feedback). A caller that really needs to drive it can still pass
// `refreshing` explicitly.

export type RefresherProps = Omit<RefreshControlProps, "refreshing"> & {
  /** Drive the spinner yourself (rare). Omit to let a pull own it. */
  refreshing?: boolean;
  onRefresh: () => unknown;
};

const MIN_VISIBLE_MS = 450;

export function Refresher({ refreshing, onRefresh, ...props }: RefresherProps) {
  const c = useThemeColors();
  const [pulling, setPulling] = useState(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const handleRefresh = useCallback(() => {
    setPulling(true);
    const started = Date.now();
    const settle = () => {
      const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - started));
      setTimeout(() => {
        if (mounted.current) setPulling(false);
      }, wait);
    };
    let result: unknown;
    try {
      result = onRefresh();
    } catch {
      settle();
      return;
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).then(settle, settle);
    } else {
      settle();
    }
  }, [onRefresh]);

  return (
    <RefreshControl
      // iOS reads `tintColor`; Android reads `colors` + `progressBackgroundColor`.
      tintColor={c.primary}
      colors={[c.primary]}
      progressBackgroundColor={c.card}
      {...props}
      refreshing={refreshing ?? pulling}
      onRefresh={handleRefresh}
    />
  );
}

/**
 * The "refreshing on top of what is already there" pattern for a screen
 * whose body is a plain ScrollView: existing content stays put and visible,
 * with a thin brand bar at the top while the refetch runs, so a refresh
 * never blanks the screen the user was reading.
 */
export function RefreshingBar({ visible }: { visible: boolean }) {
  const c = useThemeColors();
  if (!visible) return null;
  return (
    <View style={{ height: 2, backgroundColor: c.primary, opacity: 0.7 }} />
  );
}
