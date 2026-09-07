import { reportClientError } from "@/lib/reportClientError";
import { Sentry } from "@/lib/sentry";
import type { ErrorBoundaryProps } from "expo-router";
import { usePathname } from "expo-router";
import { useEffect } from "react";
import { Pressable, Text, View, useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Root Expo Router error boundary — re-exported as `ErrorBoundary` from
// app/_layout.tsx, so it catches a render/effect throw anywhere in the
// navigation tree (the native counterpart of the web app's
// global-error.tsx). Reports the crash to the observability pipeline once,
// then offers a retry that clears the boundary and re-renders the route.
//
// Non-render errors (unhandled rejections, timer throws) are covered
// separately by installGlobalErrorHandler() in src/lib/errorTracking.ts.
//
// IMPORTANT: expo-router mounts this boundary *around* RootLayout, so when
// RootLayout (or anything under it) throws, this renders with RootLayout's
// providers — ThemeProvider, I18nProvider, GestureHandlerRootView — GONE.
// It therefore uses only bare react-native primitives + hardcoded colours;
// pulling in a themed component (AppText / Button from @abonten/ui-native)
// made the error screen itself crash with "useTheme must be used within
// <ThemeProvider>", masking the real error.

const PALETTE = {
  light: { bg: "#ffffff", fg: "#0b0f14", muted: "#5b6570", accent: "#0f9d8f" },
  dark: { bg: "#0b0f14", fg: "#f2f4f6", muted: "#9aa4ae", accent: "#2dd4bf" },
};

export function RootErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const pathname = usePathname();
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const c = PALETTE[scheme];

  useEffect(() => {
    // Both sinks: the self-hosted pipeline and the abonten-mobile Sentry
    // project. This route-level boundary catches render errors before
    // Sentry.wrap's boundary would, so Sentry needs the explicit capture.
    reportClientError(error, {
      route: pathname,
      severity: "fatal",
      extra: { boundary: "root" },
    });
    Sentry.captureException(error, { level: "fatal" });
  }, [error, pathname]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 32,
        }}
      >
        <Text style={{ color: c.fg, fontSize: 16, fontWeight: "700" }}>
          Something went wrong
        </Text>
        <Text style={{ color: c.muted, fontSize: 14, textAlign: "center" }}>
          The team has been notified. You can try again — your place is saved.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void retry();
          }}
          style={{
            marginTop: 8,
            backgroundColor: c.accent,
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 10,
          }}
        >
          <Text style={{ color: "#ffffff", fontSize: 15, fontWeight: "600" }}>
            Try again
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// Expo Router looks for a named `ErrorBoundary` export on the route module.
export { RootErrorBoundary as ErrorBoundary };
