import { reportClientError } from "@/lib/reportClientError";
import { Sentry } from "@/lib/sentry";
import { AppText, Button } from "@abonten/ui-native";
import type { ErrorBoundaryProps } from "expo-router";
import { usePathname } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Root Expo Router error boundary — re-exported as `ErrorBoundary` from
// app/_layout.tsx, so it catches a render/effect throw anywhere in the
// navigation tree (the native counterpart of the web app's
// global-error.tsx). Reports the crash to the observability pipeline once,
// then offers a retry that clears the boundary and re-renders the route.
//
// Non-render errors (unhandled rejections, timer throws) are covered
// separately by installGlobalErrorHandler() in src/lib/errorTracking.ts.

export function RootErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const pathname = usePathname();

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
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center gap-3 p-8">
        <AppText variant="bodyStrong">Something went wrong</AppText>
        <AppText variant="muted" className="text-center">
          The team has been notified. You can try again — your place is saved.
        </AppText>
        <Button
          title="Try again"
          variant="primary"
          onPress={() => {
            void retry();
          }}
          className="mt-2"
        />
      </View>
    </SafeAreaView>
  );
}

// Expo Router looks for a named `ErrorBoundary` export on the route module.
export { RootErrorBoundary as ErrorBoundary };
