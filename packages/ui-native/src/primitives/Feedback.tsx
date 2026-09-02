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

export type ListFooterProps = {
  /** The current number of rows already rendered. */
  count: number;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  /** Shown once the whole list is exhausted (count > 0, no next page). */
  endLabel?: string;
};

/**
 * The standard footer for an infinite `FlatList` (`ListFooterComponent`):
 * a spinner while the next page loads, a "couldn't load more — Retry" row on
 * a page error, or a quiet end-of-list note once everything is in. Renders
 * nothing while idle mid-list or when the list is empty (the list's
 * `ListEmptyComponent` owns that case).
 */
export function ListFooter({
  count,
  isFetchingNextPage,
  hasNextPage,
  isError,
  onRetry,
  endLabel = "You're all caught up",
}: ListFooterProps) {
  if (isFetchingNextPage) return <Spinner className="py-5" />;

  if (isError && count > 0) {
    return (
      <View className="items-center gap-2 py-5">
        <AppText variant="small" tone="muted">
          Couldn't load more.
        </AppText>
        {onRetry ? (
          <Button title="Retry" size="sm" variant="outline" onPress={onRetry} />
        ) : null}
      </View>
    );
  }

  if (count > 0 && !hasNextPage) {
    return (
      <AppText variant="caption" className="py-5 text-center">
        {endLabel}
      </AppText>
    );
  }

  return null;
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
