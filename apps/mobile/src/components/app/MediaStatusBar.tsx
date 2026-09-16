import { useTheme } from "@abonten/ui-native/theme";
import { useIsFocused, useNavigation } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useLayoutEffect } from "react";
import { Platform } from "react-native";

// White status icons over black full-screen media (the Spotlight feed, a
// single Spotlight, the Story viewer). Render it only while the screen is
// actually black, so a screen that falls back to a normal page (an ended
// Story) keeps the theme's icons.
//
// The two platforms need different mechanisms:
// - Android: the native-stack `statusBarStyle` option, which follows the
//   focused screen on push and pop. An in-screen <StatusBar> kept white icons
//   over the next screen's white header (found on the emulator).
// - iOS: `statusBarStyle` needs UIViewControllerBasedStatusBarAppearance = YES,
//   but expo-status-bar (root layout) needs NO — Expo's default — and
//   react-native-screens logs an error when it is NO. So iOS uses
//   expo-status-bar, mounted only while this screen is focused so the entry
//   is removed when another screen is pushed on top.
export function MediaStatusBar() {
  const navigation = useNavigation();
  const focused = useIsFocused();
  const { scheme } = useTheme();

  useLayoutEffect(() => {
    if (Platform.OS !== "android") return;
    navigation.setOptions({ statusBarStyle: "light" });
    return () =>
      navigation.setOptions({
        statusBarStyle: scheme === "dark" ? "light" : "dark",
      });
  }, [navigation, scheme]);

  if (Platform.OS !== "ios" || !focused) return null;
  return <StatusBar style="light" />;
}
