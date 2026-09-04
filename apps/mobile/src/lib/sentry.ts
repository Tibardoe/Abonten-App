import * as Sentry from "@sentry/react-native";
import { isRunningInExpoGo } from "expo";

// Native + JS crash/error monitoring for the `abonten-mobile` Sentry
// project (Android + iOS). Runs ALONGSIDE the existing self-hosted
// pipeline (src/lib/reportClientError.ts → /api/observability/error) — that
// is left untouched; Sentry is a second, parallel sink.
//
// initSentry() is called once at module scope in app/_layout.tsx, before
// the first render, so Sentry's global JS error handler is in place before
// installGlobalErrorHandler() chains ours in front of it (uncaught errors
// therefore reach both sinks).

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

// Screen breadcrumbs + route transactions for Expo Router. Registered
// against the router's navigation container in app/_layout.tsx.
export const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: !isRunningInExpoGo(),
});

let started = false;

export function initSentry(): void {
  if (started) return;
  started = true;

  Sentry.init({
    dsn,
    // Off under Metro (`__DEV__`) and when no DSN is configured, so local
    // work never reaches the production project. Release builds with
    // EXPO_PUBLIC_SENTRY_DSN set report; preview vs production is the
    // `environment` tag, not an on/off switch.
    enabled: !__DEV__ && Boolean(dsn),
    environment:
      process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ??
      (__DEV__ ? "development" : "production"),
    // release + dist are auto-detected from the native build by the Sentry
    // Metro/Gradle/Xcode integration — do not set them here or the
    // uploaded source maps won't match.
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    // Native frames tracking + TTID need the native module (not Expo Go).
    enableNativeFramesTracking: !isRunningInExpoGo(),
    integrations: [navigationIntegration],
  });
}

export { Sentry };
