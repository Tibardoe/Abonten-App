import { useEventDetail } from "@/features/discovery/useEventDetail";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { formatFullDateTimeRange } from "@abonten/core/dateFormatter";
import { parseEventTypes } from "@abonten/core/parseEventTypes";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

function priceRange(tickets: { price: number; currency: string }[]): string {
  if (tickets.length === 0) return "Free";
  const prices = tickets.map((t) => t.price);
  const min = Math.min(...prices);
  if (min === 0 && prices.every((p) => p === 0)) return "Free";
  const currency = tickets[0]?.currency ?? "GHS";
  return `From ${currency} ${min}`;
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { data, isLoading, isError, refetch } = useEventDetail(id);

  useEffect(() => {
    if (data?.event.title) {
      navigation.setOptions({ title: data.event.title });
    }
  }, [data?.event.title, navigation]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text className="text-center text-muted-foreground">
          This event could not be loaded.
        </Text>
        <Pressable
          className="rounded-lg bg-primary px-4 py-2 active:opacity-90"
          onPress={() => refetch()}
        >
          <Text className="font-semibold text-primary-foreground">Retry</Text>
        </Pressable>
      </View>
    );
  }

  const { event, attendanceCount } = data;
  const flyer =
    event.flyer_public_id && event.flyer_version
      ? buildCloudinaryUrl(event.flyer_public_id, event.flyer_version, {
          width: 720,
          height: 400,
        })
      : null;
  const when = formatFullDateTimeRange(event.starts_at, event.ends_at);
  const tags = parseEventTypes(event.event_type);
  const canceled = event.status === "canceled";
  const organizerAvatar =
    event.user_info?.avatar_public_id && event.user_info.avatar_version
      ? buildCloudinaryUrl(
          event.user_info.avatar_public_id,
          event.user_info.avatar_version,
          { width: 48, height: 48 },
        )
      : null;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="pb-10"
    >
      {flyer ? (
        <Image
          source={{ uri: flyer }}
          style={{ width: "100%", height: 220 }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View className="h-52 items-center justify-center bg-muted">
          <Text className="text-muted-foreground">No image</Text>
        </View>
      )}

      <View className="gap-5 p-4">
        {canceled ? (
          <View className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2">
            <Text className="text-center text-sm font-medium text-destructive">
              This event has been canceled.
            </Text>
          </View>
        ) : null}

        <View className="gap-1">
          <Text className="text-xl font-bold text-foreground">
            {event.title}
          </Text>
          <Text className="text-sm font-semibold text-primary">
            {priceRange(event.ticket_type)}
          </Text>
        </View>

        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <Row icon="calendar-outline" label={when.date} sub={when.time} />
          <Row
            icon="location-outline"
            label={event.address?.full_address ?? "Location unavailable"}
            sub={event.place ? `At ${event.place.name}` : undefined}
          />
          <Row
            icon="people-outline"
            label={`${attendanceCount} attending`}
            sub={event.capacity ? `Capacity ${event.capacity}` : undefined}
          />
        </View>

        {event.user_info ? (
          <View className="flex-row items-center gap-3">
            {organizerAvatar ? (
              <Image
                source={{ uri: organizerAvatar }}
                style={{ width: 40, height: 40, borderRadius: 20 }}
              />
            ) : (
              <View className="h-10 w-10 rounded-full bg-muted" />
            )}
            <View>
              <Text className="text-xs text-muted-foreground">
                Organized by
              </Text>
              <Text className="text-sm font-semibold text-foreground">
                {event.user_info.username}
              </Text>
            </View>
          </View>
        ) : null}

        {event.description ? (
          <View className="gap-2">
            <Text className="text-base font-semibold text-foreground">
              About
            </Text>
            <Text className="text-sm leading-relaxed text-muted-foreground">
              {event.description}
            </Text>
          </View>
        ) : null}

        <View className="flex-row flex-wrap gap-2">
          <Chip text={event.event_category} />
          {tags.map((t) => (
            <Chip key={t} text={`#${t}`} />
          ))}
        </View>

        <Pressable
          className="items-center rounded-xl bg-muted px-4 py-3"
          disabled
        >
          <Text className="text-sm font-semibold text-muted-foreground">
            {canceled ? "Tickets unavailable" : "Ticket checkout coming soon"}
          </Text>
        </Pressable>

        <Pressable className="items-center py-2" onPress={() => router.back()}>
          <Text className="text-sm text-primary">Back to browsing</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Row({
  icon,
  label,
  sub,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub?: string;
}) {
  return (
    <View className="flex-row gap-3">
      <Ionicons name={icon} size={18} color="#888" style={{ marginTop: 2 }} />
      <View className="flex-1">
        <Text className="text-sm text-foreground">{label}</Text>
        {sub ? (
          <Text className="text-xs text-muted-foreground">{sub}</Text>
        ) : null}
      </View>
    </View>
  );
}

function Chip({ text }: { text: string }) {
  return (
    <View className="rounded-full bg-muted px-3 py-1">
      <Text className="text-xs text-muted-foreground">{text}</Text>
    </View>
  );
}
