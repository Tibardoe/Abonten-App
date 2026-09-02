import { CardStatusOverlay } from "@/components/CardStatusOverlay";
import { FavoriteButton } from "@/components/FavoriteButton";
import { useAttendingEventIds } from "@/features/discovery/useAttendingEventIds";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { getFormattedEventDate } from "@abonten/core/dateFormatter";
import { getEventStatus } from "@abonten/core/eventStatus";
import { getEventSoldOutStatus } from "@abonten/core/getEventSoldOutStatus";
import { getEventStatusOverlay } from "@abonten/core/getEventStatusOverlay";
import type { UserPostType } from "@abonten/types/postsType";
import { AppText, Icon, Skeleton } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

// Native EventCard — same information and hierarchy as the web
// molecules/EventCard: cover with a favourite toggle, a "You're going"
// corner badge and a canceled / sold-out / ended status wash, then title,
// location, date + time, and a spots-left / attending / price row.

function priceLabel(event: UserPostType): string {
  const price = event.min_price ?? event.ticket_price;
  if (price == null || price === 0) return "Free entry";
  const currency = event.currency ?? event.ticket_currency ?? "GHS";
  return `${currency} ${price.toLocaleString()}`;
}

// Same precedence as the web centerOverlay: canceled wins, then sold-out,
// then the lifecycle overlay (Ongoing / Event Ended).
function statusOverlay(event: UserPostType): {
  label: string;
  canceled: boolean;
} | null {
  if (event.status === "canceled")
    return { label: "Event canceled", canceled: true };
  const soldOut = getEventSoldOutStatus({
    capacity: event.capacity,
    attendeeCount: event.attendanceCount ?? event.attendance_count ?? 0,
  });
  if (soldOut) return { label: "Sold out", canceled: false };
  const lifecycle = getEventStatusOverlay(
    event.starts_at,
    event.ends_at,
    event.occurrences,
  );
  return lifecycle ? { label: lifecycle, canceled: false } : null;
}

function MetaPill({ label }: { label: string }) {
  return (
    <View className="rounded-full bg-muted px-2 py-1">
      <AppText className="text-[11px] text-muted-foreground">{label}</AppText>
    </View>
  );
}

export function EventCard({ event }: { event: UserPostType }) {
  const router = useRouter();
  const attendingIds = useAttendingEventIds();

  const flyer =
    event.flyer_public_id && event.flyer_version
      ? buildCloudinaryUrl(event.flyer_public_id, event.flyer_version, {
          width: 420,
          height: 236,
        })
      : null;
  const overlay = statusOverlay(event);
  const dateTime = getFormattedEventDate(
    event.starts_at,
    event.ends_at,
    event.occurrences,
  );
  const attendees = event.attendanceCount ?? event.attendance_count ?? 0;
  const lifecycle = getEventStatus(
    event.starts_at,
    event.ends_at,
    event.occurrences,
  );
  const showGoing =
    attendingIds.has(event.id) &&
    event.status !== "canceled" &&
    lifecycle !== "ended";
  const spotsLeft =
    event.capacity && event.capacity > 0
      ? `${Math.max(event.capacity - attendees, 0)} spots left`
      : "Unlimited";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={event.title}
      className="overflow-hidden rounded-xl border border-border bg-card active:opacity-95"
      onPress={() => router.push(`/(app)/event/${event.id}`)}
    >
      <View className="relative aspect-[16/9] bg-muted">
        {flyer ? (
          <Image
            source={{ uri: flyer }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Icon name="image-outline" size={22} tone="muted" />
          </View>
        )}

        {showGoing ? (
          <View className="absolute left-2 top-2 flex-row items-center gap-1 rounded-full bg-success px-2.5 py-1">
            <Icon name="ticket" size={12} tone="inverse" />
            <AppText className="text-[11px] font-semibold text-success-foreground">
              You're going
            </AppText>
          </View>
        ) : null}

        <View className="absolute right-2 top-2">
          <FavoriteButton kind="event" id={event.id} onSurface size={18} />
        </View>

        {overlay ? (
          <CardStatusOverlay
            label={overlay.label}
            canceled={overlay.canceled}
          />
        ) : null}
      </View>

      <View className="gap-2 p-3">
        <AppText
          className="text-[16px] font-semibold text-foreground"
          numberOfLines={2}
        >
          {event.title}
        </AppText>

        <View className="flex-row items-start gap-1.5">
          <Icon
            name="location-outline"
            size={14}
            tone="muted"
            style={{ marginTop: 2 }}
          />
          <AppText
            className="flex-1 text-[12px] text-muted-foreground"
            numberOfLines={2}
          >
            {event.address?.full_address ?? "Location not specified"}
          </AppText>
        </View>

        <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
          <View className="flex-row items-center gap-1.5">
            <Icon name="calendar-outline" size={14} tone="muted" />
            <AppText className="text-[12px] text-muted-foreground">
              {dateTime?.date ?? "Date TBC"}
            </AppText>
          </View>
          {dateTime?.time ? (
            <View className="flex-row items-center gap-1.5">
              <Icon name="time-outline" size={14} tone="muted" />
              <AppText className="text-[12px] text-muted-foreground">
                {dateTime.time}
              </AppText>
            </View>
          ) : null}
        </View>

        <View className="mt-0.5 flex-row flex-wrap items-center justify-between gap-2">
          <View className="flex-row flex-wrap items-center gap-1.5">
            <MetaPill label={spotsLeft} />
            <MetaPill label={`${attendees} attending`} />
          </View>
          <View className="rounded-full bg-primary px-3 py-1">
            <AppText className="text-[12px] font-semibold text-primary-foreground">
              {priceLabel(event)}
            </AppText>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function EventCardSkeleton() {
  return (
    <View className="overflow-hidden rounded-xl border border-border bg-card">
      <Skeleton height={180} radius={0} />
      <View className="gap-2 p-3">
        <Skeleton width="80%" height={16} />
        <Skeleton width="60%" height={12} />
        <Skeleton width="45%" height={12} />
        <View className="mt-1 flex-row justify-between">
          <Skeleton width={120} height={20} radius={999} />
          <Skeleton width={64} height={20} radius={999} />
        </View>
      </View>
    </View>
  );
}
