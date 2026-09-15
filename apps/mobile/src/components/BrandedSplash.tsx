import { ABONTEN_MARK_PATHS } from "@abonten/ui-native";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

// The JS continuation of the native splash. `app/_layout.tsx` renders this
// (instead of a bare <View>) while fonts, the saved theme and the persisted
// session load, so there is no unstyled frame between the OS splash and the
// first screen.
//
// It draws exactly what the native splash draws — the brand mark, contained
// at SPLASH_MARK_WIDTH on the same #121410 ground (see the expo-splash-screen
// plugin block in app.json: `imageWidth: 192`, `resizeMode: "contain"`) — so
// the hand-off is a seamless cross-fade, with a spinner added only once
// initialisation runs long. The mark is the vector `AbontenLogo`, so it is
// crisp at any density; the previous photo splash showed the mark at ~24%
// of the width over a dark crowd, which read as a small logo on black.
//
// Drawn from the raw path data rather than <AbontenLogo>: this renders
// BEFORE the providers mount (app/_layout.tsx shows it while fonts load),
// and AbontenLogo reads the theme context, which does not exist yet — that
// threw "useTheme must be used within <ThemeProvider>" on a cold start.

const SPLASH_BG = "#121410";
/** Must match app.json › expo-splash-screen › imageWidth. */
const SPLASH_MARK_WIDTH = 192;

export function BrandedSplash() {
  return (
    <View style={styles.root} accessibilityLabel="Abonten" accessible>
      <View style={styles.mark}>
        <Svg
          width={SPLASH_MARK_WIDTH}
          height={Math.round((SPLASH_MARK_WIDTH * 393) / 417)}
          viewBox="0 0 417 393"
        >
          {ABONTEN_MARK_PATHS.map((d) => (
            <Path key={d.slice(0, 16)} d={d} fill="#ffffff" />
          ))}
        </Svg>
      </View>
      <View style={styles.spinner}>
        <ActivityIndicator color="rgba(255,255,255,0.75)" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SPLASH_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: {
    // expo-splash-screen centres the contained image in the full window;
    // the mark's 417:393 box is centred the same way here.
    alignItems: "center",
    justifyContent: "center",
  },
  spinner: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: "14%",
    alignItems: "center",
  },
});
