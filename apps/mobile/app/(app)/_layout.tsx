import { AppDrawer } from "@/components/app/AppDrawer";
import { MenuSheetProvider } from "@/components/app/menuSheet";
import { ExploreLocationProvider } from "@/features/discovery/ExploreLocationProvider";
import { usePushRegistration } from "@/features/notifications/usePushRegistration";
import { useThemeColors } from "@abonten/ui-native/theme";
import { Stack } from "expo-router";

// The (app) group is a native stack: the (tabs) group is the anchor screen,
// and every other screen (details, organizer, settings, notifications, the
// create wizards, …) is pushed on top of it. That gives real push/pop back
// behaviour, the iOS swipe-back gesture, and Android hardware-back for free.
// Each screen draws its own <AppHeader>, so the stack header stays hidden.
export const unstable_settings = { anchor: "(tabs)" };

function StackHost() {
  // Register this device for push while the user is inside the app.
  usePushRegistration();
  const c = useThemeColors();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.background },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="event/new"
        options={{ animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="place/new"
        options={{ animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="checkout/[sessionId]"
        options={{ animation: "slide_from_bottom" }}
      />
    </Stack>
  );
}

export default function AppLayout() {
  return (
    <ExploreLocationProvider>
      <MenuSheetProvider>
        <StackHost />
        <AppDrawer />
      </MenuSheetProvider>
    </ExploreLocationProvider>
  );
}
