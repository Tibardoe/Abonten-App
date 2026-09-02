import { useThemeColors } from "@abonten/ui-native/theme";
import { Stack } from "expo-router";

// Settings is a small nested stack inside the (app) stack — the native echo
// of the web (settings) route group + SettingsDesktopSidebar. Each screen
// draws its own <AppHeader variant="title">, so the stack header is hidden.
export default function SettingsLayout() {
  const c = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.background },
      }}
    />
  );
}
