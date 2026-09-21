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
import { setNativeRootBackground } from "@/lib/nativeBackground";
import { useNavigationTheme } from "@/lib/navigationTheme";
import { startNetworkSync } from "@/lib/network";
import { queryClient } from "@/lib/queryClient";
import {
  QueryPersistence,
  applyPersistedQueryDefaults,
  useIsRestoringCache,
} from "@/lib/queryPersistence";
import { Sentry, initSentry, navigationIntegration } from "@/lib/sentry";
import { startSupabaseAutoRefresh } from "@/lib/supabase";
import { ToastProvider } from "@abonten/ui-native";
import { I18nProvider } from "@abonten/ui-native/i18n";
import { ThemeProvider, useTheme } from "@abonten/ui-native/theme";
import { PortalProvider } from "@gorhom/portal";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import {
  ThemeProvider as NavigationThemeProvider,
  Slot,
  useNavigationContainerRef,
  usePathname,
  useRouter,
  useSegments,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
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

// Allowlisted queries (queryPersistPolicy.ts) must outlive the default
// in-memory gcTime, or a screen visited earlier would drop out of the cache
// before it was ever written to disk.
applyPersistedQueryDefaults();

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
  const { ready: themeReady, colors } = useTheme();
  const navigationTheme = useNavigationTheme();
  // Held until the previous session's cached data is back in memory, so
  // the first screen renders what was there last time — even offline —
  // instead of a spinner followed by the same content.
  const restoringCache = useIsRestoringCache();
  const booting = initializing || !themeReady || restoringCache;

  useEffect(() => {
    if (!booting) SplashScreen.hideAsync().catch(() => {});
  }, [booting]);

  // Paint the NATIVE root with the theme too — the iOS window and root view
  // controller, and the Android decor view. They sit under every navigator,
  // modal and transition; left alone they are system white/black (iOS
  // leaves the window itself unpainted), which is what showed through
  // during swipe-back, tab shifts and sheet presentation whenever the
  // in-app theme differed from what UIKit assumed. expo-system-ui also
  // stores the colour, so the next cold start paints it natively before any
  // JavaScript runs.
  useEffect(() => {
    if (booting) return;
    setNativeRootBackground(colors.background);
  }, [booting, colors.background]);

  if (booting) {
    return <BrandedSplash />;
  }

  // Three layers, bottom up, all painted from the one theme:
  //   * the native root (above) — the window under everything;
  //   * this view — the RN root, visible in the frame between two screens
  //     of a fast push/pop or a tab shift;
  //   * the navigation theme — the surfaces React Navigation paints
  //     natively itself, above all the iOS navigation controller's own view
  //     that an interrupted or reversed swipe-back exposes beside the
  //     screen (see navigationTheme.ts). Screens' own styles cannot reach it.
  return (
    <NavigationThemeProvider value={navigationTheme}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Slot />
        <OfflineBanner />
      </View>
    </NavigationThemeProvider>
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
                <QueryPersistence>
                  {/* ToastProvider wraps the navigator so a toast raised on one
                    screen survives the navigation the same action triggers
                    (publish -> replace to the new event, and the "Event
                    published" confirmation still lands). */}
                  <ToastProvider>
                    {/* Every <Sheet> renders through this portal, into the
                        app's own view hierarchy instead of an RN <Modal> —
                        that is what lets the platform's keyboard insets, safe
                        areas and the root gesture handler reach a sheet at
                        all (see Sheet.tsx). It sits BELOW the theme, i18n and
                        session providers because a portal renders its content
                        at the HOST's position in the tree, so anything above
                        the host is out of context for a sheet; and ABOVE the
                        navigator so a sheet covers the tab bar. */}
                    <PortalProvider>
                      <StatusBar style="auto" />
                      <RootNavigator />
                    </PortalProvider>
                  </ToastProvider>
                </QueryPersistence>
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
