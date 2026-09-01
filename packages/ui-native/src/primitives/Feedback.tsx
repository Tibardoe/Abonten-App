import { ActivityIndicator, View } from "react-native";
import { useThemeColors } from "../theme/ThemeProvider";
import { Button } from "./Button";
import { AppText } from "./Typography";

// Small shared building blocks for the loading / error / retry states that
// every list and detail screen repeats by hand today.

export function Divider({ className }: { className?: string }) {
  return (
    <View
      className={["h-px w-full bg-border", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  const c = useThemeColors();
  return (
    <View
      className={["items-center justify-center py-6", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      <ActivityIndicator color={c.primary} />
    </View>
  );
}

/** Full-screen centred spinner — the detail-screen loading state. */
export function ScreenLoader() {
  const c = useThemeColors();
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator color={c.primary} />
    </View>
  );
}

export type ErrorStateProps = {
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
};

/** Full-screen "couldn't load … / Retry" — the detail-screen error state. */
export function ScreenError({
  message = "Something went wrong. Please try again.",
  onRetry,
  retryLabel = "Retry",
}: ErrorStateProps) {
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
      <AppText variant="muted" className="text-center">
        {message}
      </AppText>
      {onRetry ? (
        <Button
          title={retryLabel}
          size="sm"
          variant="primary"
          onPress={onRetry}
        />
      ) : null}
    </View>
  );
}
