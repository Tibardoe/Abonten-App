import { Image } from "expo-image";
import { ActivityIndicator, StyleSheet, View } from "react-native";

// The JS continuation of the native splash. `app/_layout.tsx` renders this
// (instead of a bare <View>) while fonts + the persisted session load, so
// there is no unstyled white frame between the OS splash and the first
// screen. It shows the exact same asset as the native splash
// (assets/splash-icon.png, resizeMode: "cover") on the same #121410 ground,
// so the hand-off is seamless — just with a spinner once initialisation
// runs long.

const SPLASH_BG = "#121410";

export function BrandedSplash() {
  return (
    <View style={styles.root}>
      <Image
        source={require("../../assets/splash-icon.png")}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition="center"
        cachePolicy="memory-disk"
        accessibilityLabel="Abonten"
      />
      <View style={styles.spinner}>
        <ActivityIndicator color="rgba(255,255,255,0.75)" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SPLASH_BG },
  spinner: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: "14%",
    alignItems: "center",
  },
});
