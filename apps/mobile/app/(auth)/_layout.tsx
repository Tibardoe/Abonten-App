import { useThemeColors } from "@abonten/ui-native/theme";
import { Stack } from "expo-router";

export default function AuthLayout() {
  const c = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // sign-in → verify reads as a step forward rather than a hard cut.
        animation: "slide_from_right",
        // Painted so the frame between two auth screens is never the bare
        // (white) navigator view — see RootNavigator in app/_layout.tsx.
        contentStyle: { backgroundColor: c.background },
      }}
    />
  );
}
