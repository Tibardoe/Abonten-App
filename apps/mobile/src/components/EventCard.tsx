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
      className="h-8 w-8 items-center justify-center rounded-full active:opacity-70"
      style={{ backgroundColor: "rgba(17,24,32,0.55)" }}
    >
      <Icon name={icon} size={17} color="#fff" />
    </Pressable>
  );
}

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

        <View className="absolute right-2.5 top-2.5 flex-row items-center gap-2">
          <FavoriteButton kind="event" id={event.id} onSurface size={18} />
          <GlassButton
            icon="ellipsis-horizontal"
            label="More options"
            onPress={() => setMenuOpen(true)}
          />
        </View>

        {/* price sits over the scrim, bottom-left — the most scannable spot */}
        <View className="absolute bottom-2.5 left-2.5 rounded-full bg-primary px-3 py-1">
          <AppText className="text-[12px] font-semibold text-primary-foreground">
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

      <View className="gap-1.5 p-3.5">
        <AppText variant="cardTitle" numberOfLines={2}>
          {event.title}
        </AppText>

        <View className="flex-row items-center gap-1.5">
          <Icon name="calendar-outline" size={13} tone="muted" />
          <AppText
            className="flex-1 text-[12px] text-muted-foreground"
            numberOfLines={1}
          >
            {dateTime?.date ?? "Date TBC"}
            {dateTime?.time ? ` · ${dateTime.time}` : ""}
          </AppText>
        </View>

        <View className="flex-row items-center gap-1.5">
          <Icon name="location-outline" size={13} tone="muted" />
          <AppText
            className="flex-1 text-[12px] text-muted-foreground"
            numberOfLines={1}
          >
            {event.address?.full_address ?? "Location not specified"}
          </AppText>
        </View>

        {attendees > 0 && !overlay ? (
          <AppText className="text-[11px] text-muted-foreground">
            {attendees} going
          </AppText>
        ) : null}
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
