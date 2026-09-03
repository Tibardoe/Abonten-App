import "../global.css";
// Must be imported before any other module that touches the native gesture
// system (react-native-gesture-handler's own setup requirement).
import "react-native-gesture-handler";
import { SessionProvider, useSession } from "@/auth/SessionProvider";
import { BrandedSplash } from "@/components/BrandedSplash";
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
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

// Keep the native splash up until the brand font + persisted session have
// loaded, then cross-fade to the first screen. A 4s safety timer hides it
// regardless so a slow/offline cold start can never hang on the splash —
// BrandedSplash (same asset + a spinner) takes over if init runs longer.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 300, fade: true });

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

  useEffect(() => {
    if (!initializing) SplashScreen.hideAsync().catch(() => {});
  }, [initializing]);

  if (initializing) {
    return <BrandedSplash />;
  }

  return <Slot />;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(euclidFonts);

  useEffect(() => {
    startSupabaseAutoRefresh();
  }, []);

  // Never let the splash outlive a slow cold start.
  useEffect(() => {
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 4000);
    return () => clearTimeout(t);
  }, []);

  // Hold the root on the branded splash until the brand face is registered so
  // the first paint isn't in the system font. If the files fail to load we
  // still render — AppText falls back to the platform font.
  if (!fontsLoaded && !fontError) {
    return <BrandedSplash />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
