import { DetailHeaderActions } from "@/components/DetailHeaderActions";
import { AddReviewSheet } from "@/components/reviews/AddReviewSheet";
import { TicketPicker } from "@/features/checkout/TicketPicker";
import { useEventDetail } from "@/features/discovery/useEventDetail";
import { useEventReviewEligibility } from "@/features/reviews/useEventReviews";
import { eventShareUrl } from "@/lib/share";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import {
  formatFullDateTimeRange,
  getRelativeTime,
} from "@abonten/core/dateFormatter";
import { parseEventTypes } from "@abonten/core/parseEventTypes";
import { Button } from "@abonten/ui-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState } from "react";
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
  const [reviewOpen, setReviewOpen] = useState(false);

  const reviewEvent = data
    ? {
        id: data.event.id,
        organizer_id: data.event.organizer_id,
        status: data.event.status,
        starts_at: data.event.starts_at,
        ends_at: data.event.ends_at,
        event_occurrence: data.event.event_occurrence,
      }
    : undefined;
  const { data: eligibility } = useEventReviewEligibility(reviewEvent);

  const eventCode = data?.event.event_code;
  useEffect(() => {
    navigation.setOptions({
      ...(data?.event.title ? { title: data.event.title } : {}),
      headerRight: () => (
        <DetailHeaderActions
          kind="event"
          id={id}
          shareTitle={data?.event.title ?? "Event"}
          shareUrl={eventCode ? eventShareUrl(eventCode) : null}
        />
      ),
    });
  }, [data?.event.title, navigation, id, eventCode]);

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

  const { event, attendanceCount, organizerRating } = data;
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
          <Pressable
            className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3 active:opacity-80"
            onPress={() =>
              router.push(`/(app)/user/${event.user_info?.username}`)
            }
          >
            {organizerAvatar ? (
              <Image
                source={{ uri: organizerAvatar }}
                style={{ width: 44, height: 44, borderRadius: 22 }}
              />
            ) : (
              <View className="h-11 w-11 rounded-full bg-muted" />
            )}
            <View className="flex-1">
              <Text className="text-xs text-muted-foreground">
                Organized by
              </Text>
              <Text className="text-sm font-semibold text-foreground">
                {event.user_info.username}
              </Text>
              <View className="mt-0.5 flex-row items-center gap-1">
                <Text className="text-xs">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Text
                      key={i}
                      className={
                        i < Math.floor(organizerRating.average)
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }
                    >
                      ★
                    </Text>
                  ))}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  ({organizerRating.average.toFixed(1)})
                </Text>
              </View>
            </View>
            <View className="items-end gap-1">
              <Text className="text-xs text-muted-foreground">
                Posted {getRelativeTime(event.created_at)}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#888" />
            </View>
          </Pressable>
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

        {eligibility?.canReview ? (
          <Button title="Write a review" onPress={() => setReviewOpen(true)} />
        ) : eligibility &&
          !eligibility.canReview &&
          eligibility.reason === "has_review" ? (
          <View className="gap-2 rounded-xl border border-border bg-card p-4">
            <Text className="text-sm font-semibold text-foreground">
              Your review
            </Text>
            <Text className="text-sm text-warning">
              {[0, 1, 2, 3, 4].map((i) => (
                <Text
                  key={i}
                  className={
                    i < eligibility.ownReview.rating
                      ? "text-warning"
                      : "text-muted-foreground"
                  }
                >
                  ★
                </Text>
              ))}
            </Text>
            {eligibility.ownReview.title ? (
              <Text className="text-sm font-semibold text-foreground">
                {eligibility.ownReview.title}
              </Text>
            ) : null}
            {eligibility.ownReview.comment ? (
              <Text className="text-sm text-muted-foreground">
                {eligibility.ownReview.comment}
              </Text>
            ) : null}
          </View>
        ) : null}

        {canceled ? (
          <View className="items-center rounded-xl bg-muted px-4 py-3">
            <Text className="text-sm font-semibold text-muted-foreground">
              Tickets unavailable
            </Text>
          </View>
        ) : event.ticket_type.length === 0 ? null : event.ticket_type.every(
            (t) => t.price === 0,
          ) ? (
          <View className="items-center rounded-xl bg-muted px-4 py-3">
            <Text className="text-sm font-semibold text-muted-foreground">
              Free RSVP is coming to the app soon
            </Text>
          </View>
        ) : (
          <TicketPicker event={event} />
        )}

        <Pressable className="items-center py-2" onPress={() => router.back()}>
          <Text className="text-sm text-primary">Back to browsing</Text>
        </Pressable>
      </View>

      <AddReviewSheet
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        eventId={event.id}
        eventTitle={event.title}
      />
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
