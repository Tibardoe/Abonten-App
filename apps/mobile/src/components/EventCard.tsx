import { CardStatusOverlay } from "@/components/CardStatusOverlay";
import { EventCardMenu } from "@/components/EventCardMenu";
import { FavoriteButton } from "@/components/FavoriteButton";
import { CardImageScrim } from "@/components/cards/CardImageScrim";
import { useAttendingEventIds } from "@/features/discovery/useAttendingEventIds";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { getFormattedEventDate } from "@abonten/core/dateFormatter";
import { getEventStatus } from "@abonten/core/eventStatus";
import { getEventSoldOutStatus } from "@abonten/core/getEventSoldOutStatus";
import { getEventStatusOverlay } from "@abonten/core/getEventStatusOverlay";
import type { UserPostType } from "@abonten/types/postsType";
import { AppText, Icon, Skeleton } from "@abonten/ui-native";
import { shadow } from "@abonten/ui-native/theme";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

// Native EventCard — same information and hierarchy as the web
// molecules/EventCard: a clean cover (favourite toggle + "You're going"
// corner badge + a canceled / sold-out / ended status wash), then a
// title + 3-dot-menu row, the location, a date + time row, and a
// spots-left / attending / price pill row. The only deliberate departure
// from web is keeping the favourite toggle on the image (every discovery
// surface in the app puts it there, and FavoriteButton has an `onSurface`
// mode for exactly this).

function priceLabel(event: UserPostType): string {
  const price = event.min_price ?? event.ticket_price;
  if (price == null || price === 0) return "Free entry";
  const currency = event.currency ?? event.ticket_currency ?? "GHS";
  return `${currency} ${price.toLocaleString()}`;
}

function spotsLabel(event: UserPostType, attendees: number): string {
  return event.capacity && event.capacity > 0
    ? `${Math.max(event.capacity - attendees, 0)} spots left`
    : "Unlimited";
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

export function EventCard({ event }: { event: UserPostType }) {
  const router = useRouter();
  const attendingIds = useAttendingEventIds();
  const [menuOpen, setMenuOpen] = useState(false);

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

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={event.title}
      className="overflow-hidden rounded-2xl border border-border bg-card active:opacity-95"
      style={shadow.card}
      onPress={() => router.push(`/(app)/event/${event.id}`)}
    >
      <View className="relative aspect-[3/2] bg-muted">
        {flyer ? (
          <Image
            source={{ uri: flyer }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Icon name="image-outline" size={24} tone="muted" />
          </View>
        )}

        <CardImageScrim />

        {showGoing ? (
          <View className="absolute left-2.5 top-2.5 flex-row items-center gap-1 rounded-full bg-success px-2.5 py-1">
            <Icon name="ticket" size={12} tone="inverse" />
            <AppText className="text-[11px] font-semibold text-success-foreground">
              You're going
            </AppText>
          </View>
        ) : null}

        <View className="absolute right-2.5 top-2.5">
          <FavoriteButton kind="event" id={event.id} onSurface size={18} />
        </View>

        {overlay ? (
          <CardStatusOverlay
            label={overlay.label}
            canceled={overlay.canceled}
          />
        ) : null}
      </View>

      <View className="gap-2.5 p-3.5">
        {/* title + 3-dot menu row — web DiscoveryCardTitleRow */}
        <View className="flex-row items-start justify-between gap-3">
          <AppText variant="cardTitle" numberOfLines={2} className="flex-1">
            {event.title}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More options"
            hitSlop={8}
            onPress={() => setMenuOpen(true)}
            className="-m-1 p-1 active:opacity-60"
          >
            <Icon name="ellipsis-horizontal" size={18} tone="muted" />
          </Pressable>
        </View>

        <View className="flex-row items-start gap-1.5">
          <Icon name="location-outline" size={14} tone="muted" />
          <AppText
            className="flex-1 text-[12px] text-muted-foreground"
            numberOfLines={2}
          >
            {event.address?.full_address ?? "Location not specified"}
          </AppText>
        </View>

        <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
          <View className="flex-row items-center gap-1.5">
            <Icon name="calendar-outline" size={13} tone="muted" />
            <AppText className="text-[12px] text-muted-foreground">
              {dateTime?.date ?? "Date TBC"}
            </AppText>
          </View>
          {dateTime?.time ? (
            <View className="flex-row items-center gap-1.5">
              <Icon name="time-outline" size={13} tone="muted" />
              <AppText className="text-[12px] text-muted-foreground">
                {dateTime.time}
              </AppText>
            </View>
          ) : null}
        </View>

        {/* spots-left / attending / price — web's bottom metadata row */}
        <View className="flex-row flex-wrap items-center justify-between gap-2 pt-0.5">
          <View className="flex-row flex-wrap items-center gap-1.5">
            <View className="rounded-full bg-muted px-2 py-1">
              <AppText className="text-[11px] text-muted-foreground">
                {spotsLabel(event, attendees)}
              </AppText>
            </View>
            <View className="rounded-full bg-muted px-2 py-1">
              <AppText className="text-[11px] text-muted-foreground">
                {attendees} attending
              </AppText>
            </View>
          </View>
          <View className="rounded-full bg-primary px-3 py-1">
            <AppText className="text-[12px] font-semibold text-primary-foreground">
              {priceLabel(event)}
            </AppText>
          </View>
        </View>
      </View>

      <EventCardMenu
        event={event}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
    </Pressable>
  );
}

export function EventCardSkeleton() {
  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-card">
      <View className="aspect-[3/2] w-full">
        <Skeleton width="100%" radius={0} style={{ flex: 1 }} />
      </View>
      <View className="gap-2 p-3.5">
        <Skeleton width="85%" height={15} />
        <Skeleton width="55%" height={12} />
        <Skeleton width="70%" height={12} />
      </View>
    </View>
  );
}
