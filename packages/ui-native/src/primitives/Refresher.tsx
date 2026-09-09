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
// Screens pass `refreshing` + `onRefresh` exactly as before, so this is a
// drop-in swap at every existing call site.

export type RefresherProps = RefreshControlProps;

export function Refresher(props: RefresherProps) {
  const c = useThemeColors();
  return (
    <RefreshControl
      // iOS reads `tintColor`; Android reads `colors` + `progressBackgroundColor`.
      tintColor={c.primary}
      colors={[c.primary]}
      progressBackgroundColor={c.card}
      {...props}
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
