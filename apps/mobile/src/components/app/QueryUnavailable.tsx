import type { QueryView } from "@abonten/core/query/queryView";
import { AppText, Button, EmptyState, Icon, Spinner } from "@abonten/ui-native";
import type { ReactNode } from "react";
import { View } from "react-native";

// The one "nothing to show yet" surface for a screen or list resolved by
// useQueryView: loading (the caller's skeleton, or a spinner), offline with
// nothing saved on this phone, or a request that failed. Content and genuine
// empty states stay the caller's — they know what their data means.
//
// The copy is deliberately specific: offline says the thing hasn't been
// saved on this phone and will load on reconnect (React Query refetches on
// reconnect by itself), so nobody is told something doesn't exist when the
// app simply doesn't have it.

type Props = {
  view: QueryView;
  /** What is missing, for the copy: "this event", "your messages". */
  subject: string;
  onRetry?: () => void;
  /** Shown while loading instead of a spinner. */
  loading?: ReactNode;
  /** Light text on black, for full-screen media (Stories, Spotlight). */
  onMedia?: boolean;
  className?: string;
};

export function QueryUnavailable({
  view,
  subject,
  onRetry,
  loading,
  onMedia = false,
  className,
}: Props) {
  if (view.kind === "loading") {
    if (loading) return <>{loading}</>;
    return (
      <View className={["flex-1 justify-center", className ?? ""].join(" ")}>
        <Spinner />
      </View>
    );
  }
  if (view.kind !== "offline" && view.kind !== "error") return null;

  const offline = view.kind === "offline";
  const title = offline ? "You're offline" : `Couldn't load ${subject}`;
  // Worded to read right for singular and plural subjects alike
  // ("this event", "your tickets").
  const description = offline
    ? `Not saved on this phone yet. ${capitalise(subject)} will load when you're back online.`
    : "Check your connection and try again.";

  if (onMedia) {
    return (
      <View
        className={[
          "flex-1 items-center justify-center gap-3 px-8",
          className ?? "",
        ].join(" ")}
      >
        <Icon
          name={offline ? "cloud-offline-outline" : "alert-circle-outline"}
          size={30}
          color="#fff"
        />
        <AppText className="text-center text-[17px] font-semibold text-white">
          {title}
        </AppText>
        <AppText className="text-center text-white/75">{description}</AppText>
        {!offline && onRetry ? (
          <Button title="Retry" size="sm" onPress={onRetry} />
        ) : null}
      </View>
    );
  }

  return (
    <EmptyState
      className={className}
      icon={offline ? "cloud-offline-outline" : "alert-circle-outline"}
      title={title}
      description={description}
      // Offline, a retry can't succeed; the reconnect retries by itself.
      actionLabel={!offline && onRetry ? "Retry" : undefined}
      onAction={!offline ? onRetry : undefined}
    />
  );
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
