import "../global.css";
import { SessionProvider, useSession } from "@/auth/SessionProvider";
import {
  consumePendingRedirect,
  isProtectedPath,
  setPendingRedirect,
} from "@/lib/authRedirect";
import { euclidFonts } from "@/lib/fonts";
import { queryClient } from "@/lib/queryClient";
import { startSupabaseAutoRefresh } from "@/lib/supabase";
import { I18nProvider } from "@abonten/ui-native/i18n";
import { ThemeProvider } from "@abonten/ui-native/theme";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Slot, usePathname, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";

// Mirrors the web app's public-route allowlist + `/auth/signin?next=` bounce:
// discovery / detail / search render for signed-out visitors, and only the
// protected screens (tickets, wallet, account, checkout, organizer,
// notifications) send a signed-out user to the auth stack, remembering where
// they were headed. Runs only after the persisted session has been read back.
function useProtectedRoute() {
  const { session, initializing } = useSession();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return;
    const inAuthGroup = segments[0] === "(auth)";

    if (session && inAuthGroup) {
      const next = consumePendingRedirect();
      router.replace(next ?? "/(app)");
      return;
    }

    if (!session && !inAuthGroup && isProtectedPath(pathname)) {
      setPendingRedirect(pathname);
      router.replace("/(auth)/sign-in");
    }
  }, [session, initializing, segments, pathname, router]);

  return initializing;
}

function RootNavigator() {
  const initializing = useProtectedRoute();

  if (initializing) {
    return <View className="flex-1 bg-background" />;
  }

  return <Slot />;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(euclidFonts);

  useEffect(() => {
    startSupabaseAutoRefresh();
  }, []);

  // Hold the (blank) root until the brand face is registered so the first
  // paint isn't in the system font. If the files fail to load we still render
  // — AppText falls back to the platform font.
  if (!fontsLoaded && !fontError) {
    return <View className="flex-1 bg-background" />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <SessionProvider>
            <StatusBar style="auto" />
            <RootNavigator />
          </SessionProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
