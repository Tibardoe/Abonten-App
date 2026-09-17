import { AppDrawer } from "@/components/app/AppDrawer";
import { MenuSheetProvider } from "@/components/app/menuSheet";
import { ExploreFiltersProvider } from "@/features/discovery/ExploreFiltersProvider";
import { ExploreLocationProvider } from "@/features/discovery/ExploreLocationProvider";
import { usePushRegistration } from "@/features/notifications/usePushRegistration";
import { HighlightUploadProvider } from "@/features/profile/HighlightUploadProvider";
import { useRemindersSync } from "@/features/reminders/useRemindersSync";
import { useInviteBinding } from "@/features/rewards/useInviteBinding";
import { useTheme, useThemeColors } from "@abonten/ui-native/theme";
import { Stack } from "expo-router";
import { Platform } from "react-native";

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
  // Apply a friend's invite held on this device once someone is signed in.
  useInviteBinding();
  const c = useThemeColors();
  const { scheme } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.background },
        // Android: status icons follow the app's own theme on every screen;
        // full-screen media screens switch to white with <MediaStatusBar>.
        // iOS keeps expo-status-bar in the root layout (see MediaStatusBar).
        ...(Platform.OS === "android"
          ? { statusBarStyle: scheme === "dark" ? "light" : "dark" }
          : {}),
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
        // gestureEnabled:false — the composer has a full-width video-trim
        // bar with edge-adjacent drag handles; the iOS swipe-back gesture
        // would fire mid-trim. Dismiss is the X button / hardware back.
        options={{ animation: "slide_from_bottom", gestureEnabled: false }}
      />
      <Stack.Screen
        name="spotlight/new"
        // The trim bar has edge-adjacent handles; see highlight/new.
        options={{ animation: "slide_from_bottom", gestureEnabled: false }}
      />
      {/* Black full-screen media; white status icons come from
          <MediaStatusBar> inside each screen. */}
      <Stack.Screen name="spotlight/[id]" options={{ animation: "fade" }} />
      <Stack.Screen name="story/[id]" options={{ animation: "fade" }} />
      <Stack.Screen
        name="story/play"
        // Fades in over Messages; the viewer has its own drag-down dismiss,
        // so the iOS edge swipe stays off.
        options={{ animation: "fade", gestureEnabled: false }}
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
