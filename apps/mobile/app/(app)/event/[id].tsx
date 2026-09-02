import { DetailHeaderActions } from "@/components/DetailHeaderActions";
import { EventCard } from "@/components/EventCard";
import { AppHeader } from "@/components/app/AppHeader";
import { FreeRsvpCard } from "@/components/checkout/FreeRsvpCard";
import {
  MapConfigured,
  MapErrorBoundary,
  MapView,
  Marker,
  PROVIDER_GOOGLE,
} from "@/components/map/NativeMap";
import { AddReviewSheet } from "@/components/reviews/AddReviewSheet";
import { ReviewPhotoStrip } from "@/components/reviews/ReviewPhotoStrip";
import { TicketPicker } from "@/features/checkout/TicketPicker";
import { useEventDetail } from "@/features/discovery/useEventDetail";
import { useGeocode } from "@/features/discovery/useGeocode";
import { useSimilarEvents } from "@/features/discovery/useSimilarEvents";
import { useEventReviewEligibility } from "@/features/reviews/useEventReviews";
import {
  type EventReviewListItem,
  useEventRating,
  useEventReviewsList,
} from "@/features/reviews/useEventReviewsList";
import { eventShareUrl } from "@/lib/share";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import {
  formatFullDateTimeRange,
  getRelativeTime,
} from "@abonten/core/dateFormatter";
import { getEventSoldOutStatus } from "@abonten/core/getEventSoldOutStatus";
import { parseEventTypes } from "@abonten/core/parseEventTypes";
import {
  AppText,
  Avatar,
  Button,
  Icon,
  type IoniconName,
  ScreenError,
  ScreenLoader,
  SectionTitle,
  Stars,
} from "@abonten/ui-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Linking, Pressable, ScrollView, View } from "react-native";

function priceRange(tickets: { price: number; currency: string }[]): string {
  if (tickets.length === 0) return "Free";
  const prices = tickets.map((t) => t.price);
  const min = Math.min(...prices);
  if (min === 0) return "Free entry";
  const currency = tickets[0]?.currency ?? "GHS";
  return `From ${currency} ${min}`;
}

function InfoRow({
  icon,
  label,
  sub,
}: {
  icon: IoniconName;
  label: string;
  sub?: string;
}) {
  return (
    <View className="flex-row gap-3">
      <Icon name={icon} size={18} tone="muted" style={{ marginTop: 2 }} />
      <View className="flex-1">
        <AppText className="text-[14px] text-foreground">{label}</AppText>
        {sub ? (
          <AppText className="text-[12px] text-muted-foreground">{sub}</AppText>
        ) : null}
      </View>
    </View>
  );
}

function ReviewItem({ review }: { review: EventReviewListItem }) {
  return (
    <View className="gap-1.5 rounded-xl border border-border bg-card p-3">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-1 flex-row items-center gap-2">
          <Avatar
            publicId={review.reviewer?.avatar_public_id ?? undefined}
            version={review.reviewer?.avatar_version ?? undefined}
            size={28}
          />
          <AppText
            className="flex-1 text-[13px] font-semibold text-foreground"
            numberOfLines={1}
          >
            {review.reviewer?.username ?? "Attendee"}
          </AppText>
        </View>
        <Stars rating={review.rating} size={13} />
      </View>
      {review.is_verified_attendee ? (
        <View className="flex-row items-center gap-1">
          <Icon name="checkmark-circle" size={12} tone="success" />
          <AppText className="text-[11px] text-success">
            Verified attendee
          </AppText>
        </View>
      ) : null}
      {review.title ? (
        <AppText className="text-[13px] font-semibold text-foreground">
          {review.title}
        </AppText>
      ) : null}
      {review.comment ? (
        <AppText className="text-[13px] text-muted-foreground">
          {review.comment}
        </AppText>
      ) : null}
      {review.event_review_photo?.length ? (
        <ReviewPhotoStrip photos={review.event_review_photo} />
      ) : null}
      <AppText className="text-[11px] text-muted-foreground">
        {getRelativeTime(review.created_at)}
      </AppText>
    </View>
  );
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
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

  const address = data?.event.address?.full_address;
  const { data: coords } = useGeocode(address);
  const rating = useEventRating(data?.event.id);
  const reviewsList = useEventReviewsList(data?.event.id);
  const similar = useSimilarEvents(
    data?.event.id,
    data?.event.event_category,
    coords,
  );

  const eventCode = data?.event.event_code;
  const eventTitle = data?.event.title;

  const header = (
    <AppHeader
      variant="detail"
      title={eventTitle ?? "Event"}
      backFallback="/(app)"
      rightAccessory={
        <DetailHeaderActions
          kind="event"
          id={id}
          shareTitle={eventTitle ?? "Event"}
          shareUrl={eventCode ? eventShareUrl(eventCode) : null}
        />
      }
    />
  );

  if (isLoading) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <ScreenLoader />
      </View>
    );
  }
  if (isError || !data) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <ScreenError
          message="This event could not be loaded."
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  const { event, attendanceCount, organizerRating } = data;
  const flyer =
    event.flyer_public_id && event.flyer_version
      ? buildCloudinaryUrl(event.flyer_public_id, event.flyer_version, {
          width: 900,
          height: 540,
        })
      : null;
  const when = formatFullDateTimeRange(event.starts_at, event.ends_at);
  const tags = parseEventTypes(event.event_type);
  const canceled = event.status === "canceled";
  const occ = event.event_occurrence ?? [];
  const hasEnded =
    (occ.length > 0
      ? occ.every((o) => new Date(o.ends_at) < new Date())
      : event.ends_at
        ? new Date(event.ends_at) < new Date()
        : false) && !canceled;
  const soldOut = getEventSoldOutStatus({
    capacity: event.capacity,
    attendeeCount: attendanceCount,
    ticketTypes: event.ticket_type,
  });
  const isFree =
    event.ticket_type.length > 0 &&
    event.ticket_type.every((t) => t.price === 0);
  const reviews = reviewsList.data?.pages.flatMap((p) => p.reviews) ?? [];

  const openDirections = () => {
    const q = encodeURIComponent(address ?? event.title);
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${q}`,
    ).catch(() => {});
  };

  return (
    <View className="flex-1 bg-background">
      {header}
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="pb-12"
      >
        {/* Hero */}
        <View className="relative h-72 bg-muted">
          {flyer ? (
            <Image
              source={{ uri: flyer }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View className="flex-1 items-center justify-center">
              <Icon name="image-outline" size={28} tone="muted" />
            </View>
          )}
          <View
            className="absolute inset-x-0 bottom-0 h-2/3"
            style={{ backgroundColor: "rgba(0,0,0,0.32)" }}
          />
          <View
            className="absolute inset-x-0 bottom-0 h-1/3"
            style={{ backgroundColor: "rgba(0,0,0,0.34)" }}
          />
          <View className="absolute inset-x-0 bottom-0 gap-2 p-4">
            <AppText
              className="text-[24px] font-bold text-white"
              style={{
                textShadowColor: "rgba(0,0,0,0.5)",
                textShadowRadius: 8,
              }}
              numberOfLines={3}
            >
              {event.title}
            </AppText>
            <View className="flex-row flex-wrap items-center gap-2">
              <View className="flex-row items-center gap-1 rounded-full bg-black/40 px-3 py-1">
                <Icon name="pricetag" size={13} color="#fff" />
                <AppText className="text-[12px] font-semibold text-white">
                  {priceRange(event.ticket_type)}
                </AppText>
              </View>
              <View className="flex-row items-center gap-1 rounded-full bg-black/40 px-3 py-1">
                <Icon name="people" size={13} color="#fff" />
                <AppText className="text-[12px] font-semibold text-white">
                  {attendanceCount} going
                </AppText>
              </View>
            </View>
          </View>
        </View>

        {canceled || hasEnded ? (
          <View className="mx-4 mt-4 rounded-lg border border-destructive/40 bg-muted px-3 py-2">
            <AppText className="text-center text-[13px] font-medium text-destructive">
              {canceled
                ? "This event has been canceled."
                : "This event has ended."}
            </AppText>
          </View>
        ) : null}

        <View className="gap-6 p-4">
          {/* Organizer */}
          {event.user_info ? (
            <Pressable
              accessibilityRole="button"
              className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3 active:opacity-80"
              onPress={() =>
                router.push(`/(app)/user/${event.user_info?.username}`)
              }
            >
              <Avatar
                publicId={event.user_info.avatar_public_id}
                version={event.user_info.avatar_version}
                size={44}
              />
              <View className="flex-1">
                <AppText className="text-[11px] text-muted-foreground">
                  Organized by
                </AppText>
                <AppText
                  className="text-[14px] font-semibold text-foreground"
                  numberOfLines={1}
                >
                  {event.user_info.username}
                </AppText>
                <View className="mt-0.5 flex-row items-center gap-1">
                  <Stars rating={organizerRating.average} size={12} />
                  <AppText className="text-[11px] text-muted-foreground">
                    ({organizerRating.average.toFixed(1)})
                  </AppText>
                </View>
              </View>
              <View className="items-end gap-1">
                <AppText className="text-[11px] text-muted-foreground">
                  {getRelativeTime(event.created_at)}
                </AppText>
                <Icon name="chevron-forward" size={16} tone="muted" />
              </View>
            </Pressable>
          ) : null}

          {/* Date / location / attendance */}
          <View className="gap-3 rounded-xl border border-border bg-card p-4">
            <InfoRow
              icon="calendar-outline"
              label={when.date}
              sub={when.time}
            />
            <InfoRow
              icon="location-outline"
              label={address ?? "Location unavailable"}
              sub={event.place ? `At ${event.place.name}` : undefined}
            />
            <InfoRow
              icon="people-outline"
              label={`${attendanceCount} attending`}
              sub={event.capacity ? `Capacity ${event.capacity}` : undefined}
            />

            {MapConfigured && MapView && coords ? (
              <MapErrorBoundary fallback={null}>
                <View className="mt-1 h-40 overflow-hidden rounded-lg">
                  <MapView
                    style={{ flex: 1 }}
                    provider={PROVIDER_GOOGLE}
                    pointerEvents="none"
                    initialRegion={{
                      latitude: coords.lat,
                      longitude: coords.lng,
                      latitudeDelta: 0.02,
                      longitudeDelta: 0.02,
                    }}
                  >
                    {Marker ? (
                      <Marker
                        coordinate={{
                          latitude: coords.lat,
                          longitude: coords.lng,
                        }}
                      />
                    ) : null}
                  </MapView>
                </View>
              </MapErrorBoundary>
            ) : null}

            <View className="flex-row gap-2 pt-1">
              <Button
                title="Get directions"
                variant="outline"
                size="sm"
                leftIcon="navigate-outline"
                className="flex-1"
                onPress={openDirections}
              />
              {event.place ? (
                <Button
                  title="View venue"
                  variant="outline"
                  size="sm"
                  leftIcon="storefront-outline"
                  className="flex-1"
                  onPress={() =>
                    router.push(`/(app)/place/${event.place?.slug}`)
                  }
                />
              ) : null}
            </View>
          </View>

          {event.website_url ? (
            <Button
              title="Visit website"
              variant="outline"
              rightIcon="open-outline"
              onPress={() =>
                Linking.openURL(
                  event.website_url?.startsWith("http")
                    ? event.website_url
                    : `https://${event.website_url}`,
                ).catch(() => {})
              }
            />
          ) : null}

          {/* About */}
          {event.description ? (
            <View className="gap-2">
              <SectionTitle>About the event</SectionTitle>
              <AppText className="text-[14px] leading-relaxed text-muted-foreground">
                {event.description}
              </AppText>
            </View>
          ) : null}

          {/* Category + tags */}
          <View className="gap-2">
            <SectionTitle>Category &amp; tags</SectionTitle>
            <View className="flex-row flex-wrap gap-2">
              <View className="rounded-full bg-muted px-3 py-1">
                <AppText className="text-[12px] text-muted-foreground">
                  {event.event_category}
                </AppText>
              </View>
              {tags.map((t) => (
                <View key={t} className="rounded-full bg-muted px-3 py-1">
                  <AppText className="text-[12px] text-muted-foreground">
                    #{t}
                  </AppText>
                </View>
              ))}
            </View>
          </View>

          {/* Tickets / checkout */}
          <View className="gap-3">
            <SectionTitle>Tickets</SectionTitle>
            {canceled ? (
              <View className="items-center rounded-xl bg-muted px-4 py-3">
                <AppText className="text-[13px] font-semibold text-muted-foreground">
                  Tickets unavailable — this event was canceled.
                </AppText>
              </View>
            ) : hasEnded ? (
              <View className="items-center rounded-xl bg-muted px-4 py-3">
                <AppText className="text-[13px] font-semibold text-muted-foreground">
                  This event has ended.
                </AppText>
              </View>
            ) : soldOut ? (
              <View className="items-center rounded-xl bg-muted px-4 py-3">
                <AppText className="text-[13px] font-semibold text-muted-foreground">
                  Sold out
                </AppText>
              </View>
            ) : event.ticket_type.length === 0 ? (
              <AppText className="text-[13px] text-muted-foreground">
                No tickets have been set up for this event yet.
              </AppText>
            ) : isFree ? (
              <FreeRsvpCard event={event} />
            ) : (
              <TicketPicker event={event} />
            )}
          </View>

          {/* Reviews */}
          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <SectionTitle>Reviews</SectionTitle>
              {rating.data && rating.data.count > 0 ? (
                <View className="flex-row items-center gap-1.5">
                  <Stars rating={rating.data.average} size={14} />
                  <AppText className="text-[12px] text-muted-foreground">
                    {rating.data.average.toFixed(1)} ({rating.data.count})
                  </AppText>
                </View>
              ) : null}
            </View>

            {eligibility?.canReview ? (
              <Button
                title="Write a review"
                variant="outline"
                leftIcon="create-outline"
                onPress={() => setReviewOpen(true)}
              />
            ) : eligibility?.reason === "has_review" ? (
              <View className="gap-1.5 rounded-xl border border-border bg-card p-3">
                <View className="flex-row items-center justify-between">
                  <AppText className="text-[13px] font-semibold text-foreground">
                    Your review
                  </AppText>
                  <Stars rating={eligibility.ownReview.rating} size={13} />
                </View>
                {eligibility.ownReview.title ? (
                  <AppText className="text-[13px] font-semibold text-foreground">
                    {eligibility.ownReview.title}
                  </AppText>
                ) : null}
                {eligibility.ownReview.comment ? (
                  <AppText className="text-[13px] text-muted-foreground">
                    {eligibility.ownReview.comment}
                  </AppText>
                ) : null}
                {eligibility.ownReview.event_review_photo?.length ? (
                  <ReviewPhotoStrip
                    photos={eligibility.ownReview.event_review_photo}
                  />
                ) : null}
              </View>
            ) : null}

            {reviewsList.isLoading ? (
              <AppText className="text-[13px] text-muted-foreground">
                Loading reviews…
              </AppText>
            ) : reviews.length === 0 ? (
              <AppText className="text-[13px] text-muted-foreground">
                No reviews yet.
              </AppText>
            ) : (
              <View className="gap-2">
                {reviews.map((r) => (
                  <ReviewItem key={r.id} review={r} />
                ))}
                {reviewsList.hasNextPage ? (
                  <Pressable
                    accessibilityRole="button"
                    className="items-center py-2 active:opacity-60"
                    onPress={() => reviewsList.fetchNextPage()}
                    disabled={reviewsList.isFetchingNextPage}
                  >
                    <AppText className="text-[13px] font-semibold text-primary">
                      {reviewsList.isFetchingNextPage
                        ? "Loading…"
                        : "Show more reviews"}
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>

          {/* Similar events (item 13) */}
          {similar.data && similar.data.length > 0 ? (
            <View className="gap-3">
              <SectionTitle>Similar events</SectionTitle>
              <FlatList
                horizontal
                data={similar.data}
                keyExtractor={(e) => e.id}
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-3"
                renderItem={({ item }) => (
                  <View style={{ width: 260 }}>
                    <EventCard event={item} />
                  </View>
                )}
              />
            </View>
          ) : null}
        </View>

        <AddReviewSheet
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          eventId={event.id}
          eventTitle={event.title}
        />
      </ScrollView>
    </View>
  );
}
