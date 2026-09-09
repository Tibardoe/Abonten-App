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

/** Ticket detail: the QR block, then the event + holder rows. */
export function TicketDetailSkeleton() {
  return (
    <ScrollView contentContainerClassName="gap-4 p-4 pb-10">
      <View className="items-center gap-3 rounded-2xl border border-border bg-card p-6">
        <Skeleton width={200} height={200} radius={12} />
        <Skeleton width={140} height={13} />
      </View>
      <View className="gap-3 rounded-2xl border border-border bg-card p-4">
        <Skeleton width="75%" height={18} />
        {keys(4).map((k) => (
          <Skeleton key={k} width="55%" height={13} />
        ))}
      </View>
      <Skeleton height={46} radius={10} />
    </ScrollView>
  );
}

/**
 * Transactions: the period chips, the 2x2 summary tiles, then history cards.
 * Deliberately laid out row-for-row against the real screen — a skeleton that
 * is the wrong shape still makes the content jump when it lands, which is the
 * thing skeletons exist to prevent.
 */
export function TransactionsSkeleton() {
  return (
    <View className="gap-4 p-4">
      <View className="flex-row gap-2">
        {keys(3).map((k) => (
          <Skeleton key={k} width={110} height={40} radius={999} />
        ))}
      </View>
      <View className="gap-3">
        {keys(2).map((row) => (
          <View key={row} className="flex-row gap-3">
            {keys(2).map((k) => (
              <View
                key={k}
                className="flex-1 gap-2 rounded-xl border border-border bg-card p-4"
              >
                <Skeleton width="55%" height={12} />
                <Skeleton width="40%" height={20} />
              </View>
            ))}
          </View>
        ))}
      </View>
      {keys(4).map((k) => (
        <View
          key={k}
          className="gap-2.5 rounded-2xl border border-border bg-card p-4"
        >
          <View className="flex-row justify-between">
            <Skeleton width="45%" height={16} />
            <Skeleton width={80} height={16} />
          </View>
          <Skeleton width="30%" height={12} />
          <View className="flex-row justify-between">
            <Skeleton width={96} height={26} radius={999} />
            <Skeleton width={70} height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** A single transaction / receipt: header amount then labelled rows. */
export function DetailRowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <View className="gap-4 p-4">
      <View className="items-center gap-2 py-4">
        <Skeleton width={120} height={28} />
        <Skeleton width={90} height={12} />
      </View>
      <View className="gap-3 rounded-2xl border border-border bg-card p-4">
        {keys(rows).map((k) => (
          <View key={k} className="flex-row justify-between">
            <Skeleton width="35%" height={13} />
            <Skeleton width="30%" height={13} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** A public / own profile: avatar, name, stat row, then the tab grid. */
export function ProfileSkeleton() {
  return (
    <View className="gap-5 p-4">
      <View className="items-center gap-3">
        <Skeleton width={88} height={88} radius={999} />
        <Skeleton width={150} height={18} />
        <Skeleton width={100} height={12} />
      </View>
      <View className="flex-row justify-around">
        {keys(3).map((k) => (
          <View key={k} className="items-center gap-1.5">
            <Skeleton width={38} height={18} />
            <Skeleton width={56} height={11} />
          </View>
        ))}
      </View>
      <Skeleton height={38} radius={10} />
      <View className="flex-row flex-wrap gap-3">
        {keys(4).map((k) => (
          <Skeleton key={k} width="47%" height={130} radius={12} />
        ))}
      </View>
    </View>
  );
}

/** A form screen while its current values load: labelled input blocks. */
export function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <View className="gap-5 p-4">
      {keys(fields).map((k) => (
        <View key={k} className="gap-2">
          <Skeleton width={90} height={12} />
          <Skeleton height={46} radius={8} />
        </View>
      ))}
      <Skeleton height={48} radius={10} />
    </View>
  );
}

/**
 * The Explore tab while the device location is still resolving. This is the
 * app's first screen after the splash, so a bare spinner here is the single
 * most-seen "is it working?" moment — the shape of the real feed (filter
 * chips, a horizontal carousel, then the vertical list) reads as "loading
 * your area" instead.
 */
export function ExploreSkeleton() {
  return (
    <ScrollView
      scrollEnabled={false}
      contentContainerClassName="gap-5 pt-3 pb-10"
    >
      <View className="flex-row gap-2 px-4">
        {keys(4).map((k) => (
          <Skeleton key={k} width={84} height={32} radius={999} />
        ))}
      </View>
      <View className="gap-2">
        <Skeleton width={130} height={16} className="mx-4" />
        <ScrollView
          horizontal
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3 px-4"
        >
          {keys(3).map((k) => (
            <Skeleton key={k} width={260} height={150} radius={14} />
          ))}
        </ScrollView>
      </View>
      <EventListSkeleton count={3} />
    </ScrollView>
  );
}
