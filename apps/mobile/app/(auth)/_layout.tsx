import { useTheme, useThemeColors } from "@abonten/ui-native/theme";
import { Stack } from "expo-router";
import { Platform } from "react-native";

export default function AuthLayout() {
  const c = useThemeColors();
  const { scheme } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // sign-in → verify reads as a step forward rather than a hard cut.
        animation: "slide_from_right",
        // Painted so the frame between two auth screens is never the bare
        // (white) navigator view — see RootNavigator in app/_layout.tsx.
        contentStyle: { backgroundColor: c.background },
        // Android: status icons follow the app's theme here too, as in
        // (app)/_layout.tsx. Without it this stack kept the last screen's
        // style, and the clock and battery were white on the light page.
        ...(Platform.OS === "android"
          ? { statusBarStyle: scheme === "dark" ? "light" : "dark" }
          : {}),
      }}
    />
  );
}
