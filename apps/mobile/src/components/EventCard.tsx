import { EventCardMenu } from "@/components/EventCardMenu";
import { FavoriteButton } from "@/components/FavoriteButton";
import { CardImageScrim } from "@/components/cards/CardImageScrim";
import { useAttendingEventIds } from "@/features/discovery/useAttendingEventIds";
import { prefetchEventDetail } from "@/features/discovery/useEventDetail";
import { useMarket } from "@/features/markets/MarketProvider";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { getEventCardDateTime } from "@abonten/core/dateFormatter";
import { getEventStatus } from "@abonten/core/eventStatus";
import { formatMoney } from "@abonten/core/formatMoney";
import {
  getEventSoldOutStatus,
  getEventSpotsLeft,
} from "@abonten/core/getEventSoldOutStatus";
import { getEventStatusOverlay } from "@abonten/core/getEventStatusOverlay";
import type { UserPostType } from "@abonten/types/postsType";
import {
  AppText,
  Icon,
  PressableScale,
  Skeleton,
  StatusPill,
} from "@abonten/ui-native";
import { shadow } from "@abonten/ui-native/theme";
import { useQueryClient } from "@tanstack/react-query";
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
// ⋯ menu (top-right), a "You're going" badge (top-left) and, when the event
// is not simply upcoming, one status pill (bottom-left, over the scrim):
// Cancelled / Sold out / Ongoing / Ended. The pill replaced a full-image
// dark wash: the wash hid the flyer — the one thing that sells the event —
// to say something a small badge says just as clearly, and it made every
// past event on a profile read as a block of red or black. A cancelled or
// ended event also dims its flyer slightly so the card's state is obvious
// at a glance without hiding anything. Everything factual lives in the
// body, in a fixed hierarchy so a glance ranks it:
//   title (16/700)  ·  date+time (14/600)  ·  venue (13)  ·  price (14/600)
//   ·  attendance + spots (13, "few left" turns amber)
//
// Edge cases (long title / date / venue / price) are all handled by clamping
// to a bounded number of lines with a tail ellipsis and letting the text flex
// inside its row so it can never widen the card.

function priceLabel(event: UserPostType): string {
  const price = event.min_price ?? event.ticket_price;
  if (price == null || price === 0) return "Free entry";
  const currency = event.currency ?? event.ticket_currency ?? "";
  const from =
    event.min_price != null && event.min_price !== event.ticket_price
      ? "From "
      : "";
  return `${from}${formatMoney(currency, price, { trimZeroFraction: true })}`;
}

function spotsLeft(event: UserPostType, attendees: number): number | null {
  // Capacity and remaining ticket stock are independent limits, so the number
  // a buyer can act on is the smaller one. `ticket_type` is backfilled onto
  // discovery rows by withEventAvailability; when it is absent this is still
  // the capacity figure.
  return getEventSpotsLeft({
    capacity: event.capacity,
    attendeeCount: attendees,
    ticketTypes: event.ticket_type,
  });
}

// Same precedence as the web centerOverlay: cancelled wins, then sold-out,
// then the lifecycle state (Ongoing / Ended). The raw status string is fed
// to the shared <StatusPill> registry so the card's "Ongoing" is the same
// pill as the organizer dashboard's.
type CardStatus = { status: string; inactive: boolean } | null;

function statusFor(event: UserPostType): CardStatus {
  if (event.status === "canceled")
    return { status: "cancelled", inactive: true };
  const soldOut = getEventSoldOutStatus({
    capacity: event.capacity,
    attendeeCount: event.attendanceCount ?? event.attendance_count ?? 0,
    ticketTypes: event.ticket_type,
  });
  if (soldOut) return { status: "sold_out", inactive: false };
  const lifecycle = getEventStatusOverlay(
    event.starts_at,
    event.ends_at,
    event.occurrences,
  );
  if (lifecycle === "Ongoing") return { status: "ongoing", inactive: false };
  if (lifecycle) return { status: "ended", inactive: true };
  return null;
}

export function EventCard({ event }: { event: UserPostType }) {
  const router = useRouter();
  const qc = useQueryClient();
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
  const cardStatus = statusFor(event);
  // "≈ £12" beside a price in another currency, when estimates are on.
  const { estimate } = useMarket();
  const approx = estimate(
    event.min_price ?? event.ticket_price,
    event.currency ?? event.ticket_currency ?? "",
  );
  const dt = getEventCardDateTime(
    event.starts_at,
    event.ends_at,
    event.occurrences,
    event.timezone,
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
    <PressableScale
      accessibilityRole="button"
      activeScale={0.98}
      accessibilityLabel={event.title}
      className="overflow-hidden rounded-2xl border border-border bg-card active:opacity-95"
      style={shadow.card}
      // The detail starts loading on touch-down, ~100 ms before the press
      // lands, so the screen usually opens on cached data.
      onPressIn={() => prefetchEventDetail(qc, event.id)}
      onPress={() => router.push(`/(app)/event/${event.id}`)}
    >
      <View className="relative aspect-[3/2] bg-muted">
        {showImage ? (
          <Image
            source={{ uri: flyer }}
            style={{
              width: "100%",
              height: "100%",
              opacity: cardStatus?.inactive ? 0.72 : 1,
            }}
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

        {cardStatus ? (
          <View className="absolute bottom-2.5 left-2.5">
            <StatusPill status={cardStatus.status} variant="plain" />
          </View>
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
            {approx ? ` · ${approx}` : ""}
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
    </PressableScale>
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
