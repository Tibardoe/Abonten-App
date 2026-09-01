import { CardStatusOverlay } from "@/components/CardStatusOverlay";
import { FavoriteButton } from "@/components/FavoriteButton";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { getEventSoldOutStatus } from "@abonten/core/getEventSoldOutStatus";
import { getEventStatusOverlay } from "@abonten/core/getEventStatusOverlay";
import type { UserPostType } from "@abonten/types/postsType";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

function priceLabel(event: UserPostType): string {
  const price = event.min_price ?? event.ticket_price;
  if (price == null) return "Free";
  if (price === 0) return "Free";
  const currency = event.currency ?? event.ticket_currency ?? "GHS";
  return `${currency} ${price}`;
}

// Same precedence as the web EventCard centerOverlay: canceled wins, then
// sold-out, then the lifecycle overlay (Ongoing / Event Ended). "Upcoming"
// shows nothing.
function statusOverlay(event: UserPostType): {
  label: string;
  canceled: boolean;
} | null {
  if (event.status === "canceled")
    return { label: "Event Canceled", canceled: true };

  const soldOut = getEventSoldOutStatus({
    capacity: event.capacity,
    attendeeCount: event.attendanceCount ?? event.attendance_count ?? 0,
  });
  if (soldOut) return { label: "Sold Out", canceled: false };

  const lifecycle = getEventStatusOverlay(
    event.starts_at,
    event.ends_at,
    event.occurrences,
  );
  return lifecycle ? { label: lifecycle, canceled: false } : null;
}

export function EventCard({ event }: { event: UserPostType }) {
  const router = useRouter();
  const flyer =
    event.flyer_public_id && event.flyer_version
      ? buildCloudinaryUrl(event.flyer_public_id, event.flyer_version, {
          width: 360,
          height: 200,
        })
      : null;
  const overlay = statusOverlay(event);

  return (
    <Pressable
      className="overflow-hidden rounded-xl border border-border bg-card active:opacity-90"
      onPress={() => router.push(`/(app)/event/${event.id}`)}
    >
      <View className="relative">
        {flyer ? (
          <Image
            source={{ uri: flyer }}
            style={{ width: "100%", height: 176 }}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View className="h-44 items-center justify-center bg-muted">
            <Text className="text-muted-foreground">No image</Text>
          </View>
        )}

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

      <View className="gap-1 p-3">
        <Text
          className="text-base font-semibold text-foreground"
          numberOfLines={1}
        >
          {event.title}
        </Text>
        {event.starts_at ? (
          <Text className="text-xs text-muted-foreground">
            {formatDateWithSuffix(event.starts_at)}
          </Text>
        ) : null}
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {event.address?.full_address ?? ""}
        </Text>
        <View className="mt-1 flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-primary">
            {priceLabel(event)}
          </Text>
          {typeof event.distance_km === "number" ? (
            <Text className="text-xs text-muted-foreground">
              {event.distance_km.toFixed(1)} km
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
