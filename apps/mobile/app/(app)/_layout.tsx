import { AppDrawer } from "@/components/app/AppDrawer";
import { MenuSheetProvider } from "@/components/app/menuSheet";
import { ExploreFiltersProvider } from "@/features/discovery/ExploreFiltersProvider";
import { ExploreLocationProvider } from "@/features/discovery/ExploreLocationProvider";
import { usePushRegistration } from "@/features/notifications/usePushRegistration";
import { HighlightUploadProvider } from "@/features/profile/HighlightUploadProvider";
import { useRemindersSync } from "@/features/reminders/useRemindersSync";
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
  // Reconcile local event reminders with the cross-device `event_reminder`
  // rows (clears ones whose event was deleted / turned off elsewhere).
  useRemindersSync();
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
        name="highlight/new"
        options={{ animation: "slide_from_bottom" }}
      />
      <Stack.Screen name="buy/[eventId]" />
      <Stack.Screen
        name="checkout/[sessionId]"
        options={{ animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="payment/[attemptId]"
        options={{ animation: "slide_from_bottom", gestureEnabled: false }}
      />
    </Stack>
  );
}

export default function AppLayout() {
  return (
    <ExploreLocationProvider>
      <ExploreFiltersProvider>
        <HighlightUploadProvider>
          <MenuSheetProvider>
            <StackHost />
            <AppDrawer />
          </MenuSheetProvider>
        </HighlightUploadProvider>
      </ExploreFiltersProvider>
    </ExploreLocationProvider>
  );
}
