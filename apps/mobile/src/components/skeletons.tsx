import { EventCardSkeleton } from "@/components/EventCard";
import { PlaceCardSkeleton } from "@/components/PlaceCard";
import { Skeleton, SkeletonText } from "@abonten/ui-native";
import { ScrollView, View } from "react-native";

// Shared content-shaped loading states. Screens used to fall back to a bare
// centred <ActivityIndicator> / <ScreenLoader>; these mirror the real layout
// so there's no flash-then-jump when the data lands. All built on the
// ui-native <Skeleton> (bg-muted, pulses, theme-aware).

function keys(n: number) {
  return Array.from({ length: n }, (_, i) => `sk-${i}`);
}

/** Vertical list of EventCard-shaped placeholders. */
export function EventListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View className="gap-4 px-4 pt-3">
      {keys(count).map((k) => (
        <EventCardSkeleton key={k} />
      ))}
    </View>
  );
}

/** Vertical list of PlaceCard-shaped placeholders. */
export function PlaceListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View className="gap-4 px-4 pt-3">
      {keys(count).map((k) => (
        <PlaceCardSkeleton key={k} />
      ))}
    </View>
  );
}

/** Ticket-card-shaped rows for the Tickets tabs. */
export function TicketListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View className="gap-3 px-4 pt-3">
      {keys(count).map((k) => (
        <View
          key={k}
          className="overflow-hidden rounded-xl border border-border bg-card"
        >
          <View className="flex-row gap-3 p-3">
            <Skeleton width={64} height={64} radius={8} />
            <View className="flex-1 gap-2 py-1">
              <Skeleton width="75%" height={15} />
              <Skeleton width="50%" height={12} />
              <Skeleton width="40%" height={12} />
            </View>
          </View>
          <View className="border-t border-dashed border-border px-3 py-2">
            <Skeleton width={120} height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Avatar + two-line rows for the Notifications list. */
export function NotificationsSkeleton({ count = 7 }: { count?: number }) {
  return (
    <View className="gap-3 px-4 pt-3">
      {keys(count).map((k) => (
        <View
          key={k}
          className="flex-row gap-3 rounded-xl border border-border bg-card p-3"
        >
          <Skeleton width={36} height={36} radius={999} />
          <View className="flex-1 gap-2 py-0.5">
            <Skeleton width="90%" height={13} />
            <Skeleton width="55%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Generic bordered-card rows (organizer lists, payouts, etc.). */
export function RowListSkeleton({
  count = 5,
  lines = 2,
}: {
  count?: number;
  lines?: number;
}) {
  return (
    <View className="gap-3 px-4 pt-3">
      {keys(count).map((k) => (
        <View
          key={k}
          className="gap-2 rounded-xl border border-border bg-card p-4"
        >
          <Skeleton width="60%" height={14} />
          {lines > 1 ? <Skeleton width="40%" height={12} /> : null}
        </View>
      ))}
    </View>
  );
}

/** The Wallet screen: a couple of saved-method cards + the add button. */
export function WalletSkeleton() {
  return (
    <View className="gap-4 p-4">
      {keys(2).map((k) => (
        <View
          key={k}
          className="gap-2 rounded-xl border border-border bg-card p-4"
        >
          <Skeleton width="65%" height={14} />
          <Skeleton width={90} height={12} />
        </View>
      ))}
      <Skeleton height={46} radius={8} />
    </View>
  );
}

/** Organizer dashboard: stat tiles + a short list. */
export function DashboardSkeleton() {
  return (
    <View className="gap-4 p-4">
      <View className="flex-row gap-3">
        {keys(2).map((k) => (
          <View
            key={k}
            className="flex-1 gap-2 rounded-xl border border-border bg-card p-4"
          >
            <Skeleton width="50%" height={12} />
            <Skeleton width="70%" height={22} />
          </View>
        ))}
      </View>
      <RowListSkeleton count={4} />
    </View>
  );
}

/** Event detail: flyer, title block, meta rows, a CTA. */
export function EventDetailSkeleton() {
  return (
    <ScrollView contentContainerClassName="pb-10">
      <Skeleton height={240} radius={0} />
      <View className="gap-4 p-4">
        <View className="gap-2">
          <Skeleton width="85%" height={22} />
          <Skeleton width="55%" height={14} />
        </View>
        <View className="gap-2">
          <Skeleton width="70%" height={13} />
          <Skeleton width="60%" height={13} />
          <Skeleton width="45%" height={13} />
        </View>
        <Skeleton height={1} />
        <SkeletonText lines={4} />
        <Skeleton height={48} radius={10} />
      </View>
    </ScrollView>
  );
}

/** Place detail: cover, name block, badge row, description, hours. */
export function PlaceDetailSkeleton() {
  return (
    <ScrollView contentContainerClassName="pb-10">
      <Skeleton height={220} radius={0} />
      <View className="gap-4 p-4">
        <View className="gap-2">
          <Skeleton width="70%" height={22} />
          <View className="flex-row gap-2">
            <Skeleton width={80} height={22} radius={999} />
            <Skeleton width={64} height={22} radius={999} />
          </View>
        </View>
        <SkeletonText lines={3} />
        <Skeleton height={1} />
        <View className="gap-2">
          {keys(4).map((k) => (
            <Skeleton key={k} width="80%" height={13} />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
