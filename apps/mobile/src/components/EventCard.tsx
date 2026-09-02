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
      className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
      style={{ backgroundColor: "rgba(17,24,32,0.55)" }}
    >
      <Icon name={icon} size={20} color="#fff" />
    </Pressable>
  );
}

// Native EventCard. The flyer stays image-first — only a favourite toggle + a
// ⋯ menu (top-right), a "You're going" badge (top-left) and the
// canceled / sold-out / ended status wash sit over it. Everything factual
// lives in the body, in a fixed hierarchy so a glance ranks it:
//   title (16/700)  ·  date+time (14/600)  ·  venue (13)  ·  price (14/600)
//   ·  attendance + spots (13, "few left" turns amber)
//
// Edge cases (long title / date / venue / price) are all handled by clamping
// to a bounded number of lines with a tail ellipsis and letting the text flex
// inside its row so it can never widen the card.

function priceLabel(event: UserPostType): string {
  const price = event.min_price ?? event.ticket_price;
  if (price == null || price === 0) return "Free entry";
  const currency = event.currency ?? event.ticket_currency ?? "GHS";
  const from =
    event.min_price != null && event.min_price !== event.ticket_price
      ? "From "
      : "";
  return `${from}${currency} ${price.toLocaleString()}`;
}

function spotsLeft(event: UserPostType, attendees: number): number | null {
  if (!event.capacity || event.capacity <= 0) return null;
  return Math.max(event.capacity - attendees, 0);
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
  const [imageFailed, setImageFailed] = useState(false);

  const flyer =
    event.flyer_public_id && event.flyer_version
      ? buildCloudinaryUrl(event.flyer_public_id, event.flyer_version, {
          width: 480,
          height: 320,
        })
      : null;
  const showImage = flyer != null && !imageFailed;
  const overlay = statusOverlay(event);
  const dt = getEventCardDateTime(
    event.starts_at,
    event.ends_at,
    event.occurrences,
  );
  const attendees = event.attendanceCount ?? event.attendance_count ?? 0;
  const remaining = spotsLeft(event, attendees);
  const fewLeft = remaining != null && remaining > 0 && remaining <= 10;
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
        {showImage ? (
          <Image
            source={{ uri: flyer }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            transition={150}
            recyclingKey={event.id}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View className="flex-1 items-center justify-center gap-1">
            <Icon name="image-outline" size={26} tone="muted" />
          </View>
        )}

        <CardImageScrim />

        {showGoing ? (
          <View className="absolute left-2.5 top-2.5 max-w-[70%] flex-row items-center gap-1 rounded-full bg-success px-2.5 py-1">
            <Icon name="ticket" size={13} tone="inverse" />
            <AppText
              className="text-[12px] font-semibold text-success-foreground"
              numberOfLines={1}
            >
              You're going
            </AppText>
          </View>
        ) : null}

        <View className="absolute right-2.5 top-2.5 flex-row items-center gap-2">
          <FavoriteButton kind="event" id={event.id} onSurface size={20} />
          <GlassButton
            icon="ellipsis-horizontal"
            label="More options"
            onPress={() => setMenuOpen(true)}
          />
        </View>

        {overlay ? (
          <CardStatusOverlay
            label={overlay.label}
            canceled={overlay.canceled}
          />
        ) : null}
      </View>

      <View className="gap-2 p-4">
        <AppText variant="cardTitle" numberOfLines={2}>
          {event.title}
        </AppText>

        <View className="flex-row items-center gap-1.5">
          <Icon name="calendar-outline" size={14} tone="foreground" />
          <AppText variant="metaStrong" className="flex-1" numberOfLines={1}>
            {dt.date}
            {dt.time ? `  ·  ${dt.time}` : ""}
            {dt.extraDates > 0 ? `  ·  +${dt.extraDates} more` : ""}
          </AppText>
        </View>

        <View className="flex-row items-center gap-1.5">
          <Icon name="location-outline" size={14} tone="muted" />
          <AppText variant="meta" className="flex-1" numberOfLines={1}>
            {venue}
          </AppText>
        </View>

        <View className="flex-row items-center gap-1.5">
          <Icon name="pricetag-outline" size={14} tone="foreground" />
          <AppText variant="metaStrong" className="flex-1" numberOfLines={1}>
            {priceLabel(event)}
          </AppText>
        </View>

        <View className="flex-row items-center gap-1.5">
          <Icon name="people-outline" size={14} tone="muted" />
          <AppText variant="meta" numberOfLines={1}>
            {attendees.toLocaleString()} going
          </AppText>
          {remaining != null ? (
            <>
              <AppText variant="meta">·</AppText>
              <AppText
                variant="meta"
                tone={fewLeft ? "warning" : "muted"}
                className={`shrink ${fewLeft ? "font-semibold" : ""}`}
                numberOfLines={1}
              >
                {remaining.toLocaleString()} spots left
              </AppText>
            </>
          ) : null}
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
      <View className="gap-2 p-4">
        <Skeleton width="85%" height={16} />
        <Skeleton width="60%" height={14} />
        <Skeleton width="70%" height={13} />
        <Skeleton width="40%" height={14} />
        <Skeleton width="55%" height={13} />
      </View>
    </View>
  );
}
