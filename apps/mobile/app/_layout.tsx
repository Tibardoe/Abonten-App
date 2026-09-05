import "../global.css";
// Must be imported before any other module that touches the native gesture
// system (react-native-gesture-handler's own setup requirement).
import "react-native-gesture-handler";
import { SessionProvider, useSession } from "@/auth/SessionProvider";
import { BrandedSplash } from "@/components/BrandedSplash";
import { OfflineBanner } from "@/components/app/OfflineBanner";
import {
  consumePendingRedirect,
  isProtectedPath,
  setPendingRedirect,
} from "@/lib/authRedirect";
import { installGlobalErrorHandler } from "@/lib/errorTracking";
import { euclidFonts } from "@/lib/fonts";
import { startNetworkSync } from "@/lib/network";
import { queryClient } from "@/lib/queryClient";
import { Sentry, initSentry, navigationIntegration } from "@/lib/sentry";
import { startSupabaseAutoRefresh } from "@/lib/supabase";
import { I18nProvider } from "@abonten/ui-native/i18n";
import { ThemeProvider } from "@abonten/ui-native/theme";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import {
  Slot,
  useNavigationContainerRef,
  usePathname,
  useRouter,
  useSegments,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

// Initialise Sentry before the first render so its global JS error handler
// is installed ahead of installGlobalErrorHandler()'s chained one.
initSentry();

// Root render/effect crashes anywhere in the navigation tree land here
// (Expo Router picks up the `ErrorBoundary` export on this route module).
export { ErrorBoundary } from "@/components/RootErrorBoundary";

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

  const inAuthGroup = segments[0] === "(auth)";
  const redirectingHome = !initializing && !!session && inAuthGroup;
  const redirectingToSignIn =
    !initializing && !session && !inAuthGroup && isProtectedPath(pathname);

  useEffect(() => {
    if (!redirectingHome && !redirectingToSignIn) return;
    // A tab press mounts the newly-focused tab's native screen container
    // (react-native-screens) on the same commit cycle that this effect
    // fires on. Replacing the Stack screen synchronously here unmounts that
    // whole (tabs) subtree while Fabric may still be flushing the tab
    // switch's own mount instructions to native, and the two mutation sets
    // have been observed to land in one batch on Android — "the specified
    // child already has a parent" for a view that's simultaneously being
    // inserted (tab switch) and torn down (this replace). A real timer
    // (not InteractionManager.runAfterInteractions — nothing registers an
    // interaction handle for a tab press, so it fires with ~zero delay and
    // doesn't actually wait for that commit to flush) pushes this past the
    // native mounting batch.
    const timer = setTimeout(() => {
      if (redirectingHome) {
        const next = consumePendingRedirect();
        router.replace(next ?? "/(app)");
      } else if (redirectingToSignIn) {
        setPendingRedirect(pathname);
        router.replace("/(auth)/sign-in");
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [redirectingHome, redirectingToSignIn, pathname, router]);

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

  return (
    <>
      <Slot />
      <OfflineBanner />
    </>
  );
}

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(euclidFonts);
  const navigationRef = useNavigationContainerRef();

  useEffect(() => {
    installGlobalErrorHandler();
    startSupabaseAutoRefresh();
    startNetworkSync();
  }, []);

  // Feed Expo Router's navigation container to Sentry for screen
  // breadcrumbs + route transactions.
  useEffect(() => {
    if (navigationRef?.current) {
      navigationIntegration.registerNavigationContainer(navigationRef);
    }
  }, [navigationRef]);

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

// Sentry.wrap adds the touch-event breadcrumbs + a render error boundary
// that backstops the Expo Router `ErrorBoundary` above.
export default Sentry.wrap(RootLayout);
