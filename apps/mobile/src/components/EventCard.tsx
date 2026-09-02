import { CardStatusOverlay } from "@/components/CardStatusOverlay";
import { EventCardMenu } from "@/components/EventCardMenu";
import { FavoriteButton } from "@/components/FavoriteButton";
import { CardImageScrim } from "@/components/cards/CardImageScrim";
import { useAttendingEventIds } from "@/features/discovery/useAttendingEventIds";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { getEventCardDateTime } from "@abonten/core/dateFormatter";
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

// A translucent-dark circular button for controls that sit over a photo —
// readable on any image, unlike bg-card.
function GlassButton({
  icon,
  label,
  onPress,
}: {
  icon: "ellipsis-horizontal";
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
      style={{ backgroundColor: "rgba(17,24,32,0.55)" }}
    >
      <Icon name={icon} size={18} color="#fff" />
    </Pressable>
  );
}

// Native EventCard. On the flyer: a favourite toggle + a ⋯ menu (top-right),
// a "You're going" badge (top-left), a price pill (bottom-left) and the
// canceled / sold-out / ended status wash. Below: title, one date + start
// time, the venue, then spots-left + attendance.
//
// Edge cases (long title / date / venue) are all handled by clamping to a
// bounded number of lines with a tail ellipsis and letting the text flex
// inside its row so it can never widen the card:
//   • title  — 2 lines
//   • date   — a SINGLE day + time (getEventCardDateTime never returns a
//              "from – to" span; extra dates collapse to a "+N more" hint)
//   • venue  — 2 lines, icon pinned to the top of the block

function priceLabel(event: UserPostType): string {
  const price = event.min_price ?? event.ticket_price;
  if (price == null || price === 0) return "Free entry";
  const currency = event.currency ?? event.ticket_currency ?? "GHS";
  return `${currency} ${price.toLocaleString()}`;
}

function spotsLabel(event: UserPostType, attendees: number): string {
  return event.capacity && event.capacity > 0
    ? `${Math.max(event.capacity - attendees, 0).toLocaleString()} spots left`
    : "Unlimited spots";
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
          height: 280,
        })
      : null;
  const overlay = statusOverlay(event);
  const dt = getEventCardDateTime(
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
  const venue = event.address?.full_address || "Location not specified";

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
          <View className="absolute left-2.5 top-2.5 max-w-[70%] flex-row items-center gap-1 rounded-full bg-success px-2.5 py-1">
            <Icon name="ticket" size={12} tone="inverse" />
            <AppText
              className="text-[11px] font-semibold text-success-foreground"
              numberOfLines={1}
            >
              You're going
            </AppText>
          </View>
        ) : null}

        <View className="absolute right-2.5 top-2.5 flex-row items-center gap-2">
          <FavoriteButton kind="event" id={event.id} onSurface size={18} />
          <GlassButton
            icon="ellipsis-horizontal"
            label="More options"
            onPress={() => setMenuOpen(true)}
          />
        </View>

        <View className="absolute bottom-2.5 left-2.5 max-w-[60%] rounded-full bg-primary px-3 py-1">
          <AppText
            className="text-[12px] font-semibold text-primary-foreground"
            numberOfLines={1}
          >
            {priceLabel(event)}
          </AppText>
        </View>

        {overlay ? (
          <CardStatusOverlay
            label={overlay.label}
            canceled={overlay.canceled}
          />
        ) : null}
      </View>

      <View className="gap-2 p-3.5">
        <AppText variant="cardTitle" numberOfLines={2}>
          {event.title}
        </AppText>

        <View className="flex-row items-center gap-1.5">
          <Icon name="calendar-outline" size={13} tone="muted" />
          <AppText
            className="flex-1 text-[12px] text-muted-foreground"
            numberOfLines={1}
          >
            {dt.date}
            {dt.time ? `  ·  ${dt.time}` : ""}
            {dt.extraDates > 0 ? `  ·  +${dt.extraDates} more` : ""}
          </AppText>
        </View>

        <View className="flex-row items-start gap-1.5">
          <Icon
            name="location-outline"
            size={13}
            tone="muted"
            style={{ marginTop: 1 }}
          />
          <AppText
            className="flex-1 text-[12px] text-muted-foreground"
            numberOfLines={2}
          >
            {venue}
          </AppText>
        </View>

        <View className="flex-row items-center gap-1.5">
          <Icon name="people-outline" size={13} tone="muted" />
          <AppText
            className="flex-1 text-[11px] text-muted-foreground"
            numberOfLines={1}
          >
            {spotsLabel(event, attendees)} · {attendees.toLocaleString()} going
          </AppText>
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
