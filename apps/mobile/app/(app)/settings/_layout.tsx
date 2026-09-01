import { useThemeColors } from "@abonten/ui-native/theme";
import { Stack } from "expo-router";

// Settings is a small stack inside the (app) tab group — the native echo of
// the web (settings) route group + SettingsDesktopSidebar. Each screen sets
// its own title; the header styling matches the rest of the app.
export default function SettingsLayout() {
  const c = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.sidebar },
        headerTitleStyle: { color: c.foreground },
        headerTintColor: c.foreground,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: c.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Settings" }} />
      <Stack.Screen name="overview" options={{ title: "Overview" }} />
      <Stack.Screen name="edit-profile" options={{ title: "Edit Profile" }} />
      <Stack.Screen name="security" options={{ title: "Security" }} />
      <Stack.Screen name="language" options={{ title: "Language" }} />
      <Stack.Screen
        name="switch-appearance"
        options={{ title: "Switch Appearance" }}
      />
    </Stack>
  );
}
