import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
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

export function EventCard({ event }: { event: UserPostType }) {
  const router = useRouter();
  const flyer =
    event.flyer_public_id && event.flyer_version
      ? buildCloudinaryUrl(event.flyer_public_id, event.flyer_version, {
          width: 360,
          height: 200,
        })
      : null;

  return (
    <Pressable
      className="overflow-hidden rounded-xl border border-border bg-card active:opacity-90"
      onPress={() => router.push(`/(app)/event/${event.id}`)}
    >
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
