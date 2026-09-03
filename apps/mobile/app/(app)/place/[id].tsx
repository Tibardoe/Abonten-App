import { useSession } from "@/auth/SessionProvider";
import { DetailHeaderActions } from "@/components/DetailHeaderActions";
import { EventCard } from "@/components/EventCard";
import { PhotoGallery } from "@/components/PhotoGallery";
import { PlaceCard } from "@/components/PlaceCard";
import { AppHeader } from "@/components/app/AppHeader";
import {
  MapConfigured,
  MapErrorBoundary,
  MapView,
  Marker,
  PROVIDER_GOOGLE,
} from "@/components/map/NativeMap";
import { BookPlaceSheet } from "@/components/places/BookPlaceSheet";
import { ClaimPlaceSheet } from "@/components/places/ClaimPlaceSheet";
import { ReportSheet } from "@/components/places/ReportSheet";
import { PlaceReviewSheet } from "@/components/reviews/PlaceReviewSheet";
import { ReviewPhotoStrip } from "@/components/reviews/ReviewPhotoStrip";
import { PlaceDetailSkeleton } from "@/components/skeletons";
import { useNearbyPlaces } from "@/features/places/useNearbyPlaces";
import { usePlaceClaimState } from "@/features/places/usePlaceClaim";
import { usePlaceDetail } from "@/features/places/usePlaceDetail";
import {
  type PlaceReviewItem,
  usePlaceReviewsList,
  usePlaceUpcomingEvents,
} from "@/features/places/usePlaceExtras";
import {
  useDeletePlaceReview,
  usePlaceReviewEligibility,
} from "@/features/reviews/usePlaceReviews";
import { placeShareUrl } from "@/lib/share";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { computePlaceOpenStatus } from "@abonten/core/computePlaceOpenStatus";
import { getRelativeTime } from "@abonten/core/dateFormatter";
import { parseWKBHex } from "@abonten/core/parseWKBHex";
import type { PlaceType } from "@abonten/types/placeType";
import {
  AppText,
  Avatar,
  Button,
  Icon,
  type IoniconName,
  ScreenError,
  SectionTitle,
  Stars,
} from "@abonten/ui-native";
import { useCarouselCardWidth } from "@abonten/ui-native/theme";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  View,
} from "react-native";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function timeLabel(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${h}:${m ?? "00"}`;
}

function ContactRow({
  icon,
  label,
  onPress,
}: {
  icon: IoniconName;
  label: string;
  onPress?: () => void;
}) {
  const body = (
    <View className="min-h-[40px] flex-row items-center gap-3">
      <Icon name={icon} size={18} tone="muted" />
      <AppText
        variant="body"
        tone={onPress ? "brand" : "primary"}
        className="flex-1"
        numberOfLines={1}
      >
        {label}
      </AppText>
    </View>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="active:opacity-60"
    >
      {body}
    </Pressable>
  ) : (
    body
  );
}

function PlaceReviewCard({
  review,
  onReport,
}: {
  review: PlaceReviewItem;
  onReport?: () => void;
}) {
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
            variant="small"
            className="flex-1 font-semibold"
            numberOfLines={1}
          >
            {review.reviewer?.username ?? "Guest"}
          </AppText>
        </View>
        <Stars rating={review.rating} size={13} />
      </View>
      {review.title ? (
        <AppText variant="small" className="font-semibold">
          {review.title}
        </AppText>
      ) : null}
      {review.comment ? (
        <AppText variant="muted">{review.comment}</AppText>
      ) : null}
      {review.place_review_photo?.length ? (
        <ReviewPhotoStrip photos={review.place_review_photo} />
      ) : null}
      {review.owner_response ? (
        <View className="mt-1 gap-0.5 rounded-lg bg-muted p-2">
          <AppText variant="label">Response from the owner</AppText>
          <AppText variant="meta">{review.owner_response}</AppText>
        </View>
      ) : null}
      <View className="flex-row items-center justify-between">
        <AppText variant="caption">
          {getRelativeTime(review.created_at)}
        </AppText>
        {onReport ? (
          <AppText
            variant="caption"
            tone="muted"
            className="font-medium"
            onPress={onReport}
          >
            Report
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const carouselCardWidth = useCarouselCardWidth();
  const { data: place, isLoading, isError, refetch } = usePlaceDetail(id);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<
    | { kind: "place"; placeId: string; label: string }
    | { kind: "review"; reviewId: string; label: string }
    | null
  >(null);
  const { session } = useSession();

  const placeSlug = place?.slug;
  const header = (
    <AppHeader
      variant="detail"
      title={place?.name ?? "Place"}
      backFallback="/(app)"
      rightAccessory={
        <DetailHeaderActions
          kind="place"
          id={id}
          shareTitle={place?.name ?? "Place"}
          shareUrl={placeSlug ? placeShareUrl(placeSlug) : null}
          imagePublicId={place?.cover_public_id}
          imageVersion={place?.cover_version}
        />
      }
    />
  );

  const coords = useMemo(() => {
    if (!place?.location) return null;
    try {
      const { eventLat, eventLng } = parseWKBHex(place.location);
      return Number.isFinite(eventLat) && Number.isFinite(eventLng)
        ? { lat: eventLat, lng: eventLng }
        : null;
    } catch {
      return null;
    }
  }, [place?.location]);

  const reviewsList = usePlaceReviewsList(place?.id);
  const { data: eligibility } = usePlaceReviewEligibility(
    place?.id,
    place?.owner_id,
  );
  const deleteReview = useDeletePlaceReview(place?.id);
  const { data: claim } = usePlaceClaimState(place?.id, place?.owner_id);
  const upcoming = usePlaceUpcomingEvents(place?.id);
  // 10 km in metres — matches web's SIMILAR_PLACES_RADIUS_METERS.
  const nearby = useNearbyPlaces(coords, 10_000);

  const similarPlaces = useMemo<PlaceType[]>(() => {
    const rows = nearby.data?.pages.flatMap((p) => p.rows) ?? [];
    return rows
      .filter((p) => p.id !== place?.id && p.category_id === place?.category_id)
      .slice(0, 6);
  }, [nearby.data, place?.id, place?.category_id]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <PlaceDetailSkeleton />
      </View>
    );
  }
  if (isError || !place) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <ScreenError
          message="This place could not be loaded."
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  const cover =
    place.cover_public_id && place.cover_version
      ? buildCloudinaryUrl(place.cover_public_id, place.cover_version, {
          width: 900,
          height: 500,
        })
      : null;
  const openStatus = computePlaceOpenStatus(
    place.openingHours,
    place.temporary_status,
  );
  const address = place.address?.full_address;
  const reviews = reviewsList.data?.pages.flatMap((p) => p.reviews) ?? [];
  const upcomingEvents = upcoming.data ?? [];

  const openDirections = () => {
    const q = encodeURIComponent(address ?? place.name);
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${q}`,
    ).catch(() => {});
  };
  const whatsappDigits = place.whatsapp?.replace(/\D/g, "");
  // Confirmed platform choice: mobile only offers "Book" when the place has
  // at least one service (web shows it on any place).
  const canBook =
    !!session &&
    place.owner_id !== session.user.id &&
    place.services.length > 0;

  return (
    <View className="flex-1 bg-background">
      {header}
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="pb-12"
      >
        {/* Hero */}
        <View className="relative h-72 bg-muted">
          {cover ? (
            <Image
              source={{ uri: cover }}
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
              numberOfLines={2}
            >
              {place.name}
            </AppText>
            <View className="flex-row flex-wrap items-center gap-2">
              <View className="rounded-full bg-black/40 px-3 py-1">
                <AppText className="text-[12px] font-semibold text-white">
                  {place.place_category?.name ?? "Place"}
                </AppText>
              </View>
              {place.verified ? (
                <View className="flex-row items-center gap-1 rounded-full bg-black/40 px-3 py-1">
                  <Icon name="checkmark-circle" size={13} color="#fff" />
                  <AppText className="text-[12px] font-semibold text-white">
                    Verified
                  </AppText>
                </View>
              ) : null}
              <View className="rounded-full bg-black/40 px-3 py-1">
                <AppText className="text-[12px] font-semibold text-white">
                  {openStatus.label}
                </AppText>
              </View>
              <View className="flex-row items-center gap-1 rounded-full bg-black/40 px-3 py-1">
                <Icon name="star" size={12} tone="warning" />
                <AppText className="text-[12px] font-semibold text-white">
                  {place.avgRating.toFixed(1)} ({place.reviewCount})
                </AppText>
              </View>
            </View>
            {address ? (
              <View className="flex-row items-start gap-1">
                <Icon name="location-outline" size={13} color="#fff" />
                <AppText
                  className="flex-1 text-[12px] text-white/90"
                  numberOfLines={1}
                >
                  {address}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>

        <View className="gap-6 p-4">
          {canBook ? (
            <Button
              title="Book"
              leftIcon="calendar-outline"
              fullWidth
              onPress={() => setBookOpen(true)}
            />
          ) : null}

          {/* Primary actions */}
          <View className="flex-row flex-wrap gap-2">
            <Button
              title="Directions"
              variant="outline"
              size="sm"
              leftIcon="navigate-outline"
              className="flex-1"
              onPress={openDirections}
            />
            {place.phone ? (
              <Button
                title="Call"
                variant="outline"
                size="sm"
                leftIcon="call-outline"
                className="flex-1"
                onPress={() =>
                  Linking.openURL(`tel:${place.phone}`).catch(() => {})
                }
              />
            ) : null}
            {whatsappDigits ? (
              <Button
                title="WhatsApp"
                variant="outline"
                size="sm"
                leftIcon="logo-whatsapp"
                className="flex-1"
                onPress={() =>
                  Linking.openURL(`https://wa.me/${whatsappDigits}`).catch(
                    () => {},
                  )
                }
              />
            ) : null}
          </View>

          {/* Claim this place */}
          {claim?.status === "pending" ? (
            <View className="flex-row items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2.5">
              <Icon name="hourglass-outline" size={16} tone="muted" />
              <AppText variant="small" tone="muted" className="flex-1">
                Your claim for this place is awaiting review.
              </AppText>
            </View>
          ) : claim?.canClaim ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setClaimOpen(true)}
              className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3 active:opacity-80"
            >
              <Icon
                name="shield-checkmark-outline"
                size={20}
                tone="foreground"
              />
              <View className="flex-1">
                <AppText variant="bodyStrong">Own this place?</AppText>
                <AppText variant="meta">
                  Claim it to manage its details, hours and photos.
                </AppText>
              </View>
              <Icon name="chevron-forward" size={16} tone="muted" />
            </Pressable>
          ) : null}

          {/* Location */}
          <View className="gap-3 rounded-xl border border-border bg-card p-4">
            <View className="flex-row items-center gap-2">
              <Icon name="location-outline" size={18} tone="foreground" />
              <AppText variant="bodyStrong">Location</AppText>
            </View>
            <AppText variant="muted">
              {address ?? "Address not specified"}
            </AppText>
            {MapConfigured && MapView && coords ? (
              <MapErrorBoundary fallback={null}>
                <View className="h-40 overflow-hidden rounded-lg">
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
          </View>

          {/* Contact */}
          {place.phone || place.whatsapp || place.website_url ? (
            <View className="gap-1 rounded-xl border border-border bg-card p-4">
              <AppText variant="bodyStrong" className="mb-1">
                Contact
              </AppText>
              {place.phone ? (
                <ContactRow
                  icon="call-outline"
                  label={place.phone}
                  onPress={() =>
                    Linking.openURL(`tel:${place.phone}`).catch(() => {})
                  }
                />
              ) : null}
              {place.whatsapp ? (
                <ContactRow
                  icon="logo-whatsapp"
                  label={place.whatsapp}
                  onPress={() =>
                    Linking.openURL(`https://wa.me/${whatsappDigits}`).catch(
                      () => {},
                    )
                  }
                />
              ) : null}
              {place.website_url ? (
                <ContactRow
                  icon="globe-outline"
                  label={place.website_url}
                  onPress={() =>
                    Linking.openURL(
                      place.website_url?.startsWith("http")
                        ? place.website_url
                        : `https://${place.website_url}`,
                    ).catch(() => {})
                  }
                />
              ) : null}
            </View>
          ) : null}

          {/* About */}
          {place.description ? (
            <View className="gap-2">
              <SectionTitle>About</SectionTitle>
              <AppText variant="body" tone="muted">
                {place.description}
              </AppText>
            </View>
          ) : null}

          {/* Opening hours */}
          {place.openingHours.length > 0 ? (
            <View className="gap-2">
              <SectionTitle>Opening hours</SectionTitle>
              <View className="rounded-xl border border-border bg-card">
                {[...place.openingHours]
                  .sort((a, b) => a.day_of_week - b.day_of_week)
                  .map((h, i, arr) => (
                    <View
                      key={h.day_of_week}
                      className={`flex-row justify-between px-4 py-2.5 ${
                        i < arr.length - 1 ? "border-b border-border" : ""
                      }`}
                    >
                      <AppText variant="small">
                        {DAY_LABELS[h.day_of_week]}
                      </AppText>
                      <AppText variant="muted">
                        {h.is_closed || !h.open_time || !h.close_time
                          ? "Closed"
                          : `${timeLabel(h.open_time)} – ${timeLabel(h.close_time)}`}
                      </AppText>
                    </View>
                  ))}
              </View>
            </View>
          ) : null}

          {/* Services */}
          {place.services.length > 0 ? (
            <View className="gap-2">
              <SectionTitle>Services</SectionTitle>
              {place.services.map((s) => (
                <View
                  key={s.id}
                  className="rounded-xl border border-border bg-card p-3"
                >
                  <View className="flex-row justify-between gap-3">
                    <AppText variant="body" className="flex-1 font-medium">
                      {s.name}
                    </AppText>
                    {s.show_price && s.price != null ? (
                      <AppText variant="muted">
                        GHS {s.price}
                        {s.price_unit ? ` / ${s.price_unit}` : ""}
                      </AppText>
                    ) : null}
                  </View>
                  {s.description ? (
                    <AppText variant="meta" className="mt-1">
                      {s.description}
                    </AppText>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          {/* Photos */}
          {place.photos.length > 0 ? (
            <View className="gap-2">
              <SectionTitle>Photos</SectionTitle>
              <PhotoGallery photos={place.photos} />
            </View>
          ) : null}

          {/* Reviews */}
          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <SectionTitle>Reviews</SectionTitle>
              {place.reviewCount > 0 ? (
                <View className="flex-row items-center gap-1.5">
                  <Stars rating={place.avgRating} size={14} />
                  <AppText variant="meta">
                    {place.avgRating.toFixed(1)} ({place.reviewCount})
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
              <View className="gap-2 rounded-xl border border-border bg-card p-3">
                <View className="flex-row items-center justify-between">
                  <AppText variant="small" className="font-semibold">
                    Your review
                  </AppText>
                  <Stars rating={eligibility.ownReview.rating} size={13} />
                </View>
                {eligibility.ownReview.title ? (
                  <AppText variant="small" className="font-semibold">
                    {eligibility.ownReview.title}
                  </AppText>
                ) : null}
                {eligibility.ownReview.comment ? (
                  <AppText variant="muted">
                    {eligibility.ownReview.comment}
                  </AppText>
                ) : null}
                {eligibility.ownReview.place_review_photo?.length ? (
                  <ReviewPhotoStrip
                    photos={eligibility.ownReview.place_review_photo}
                  />
                ) : null}
                <View className="mt-1 flex-row gap-4">
                  <Pressable
                    accessibilityRole="button"
                    className="active:opacity-60"
                    onPress={() => setReviewOpen(true)}
                  >
                    <AppText
                      variant="small"
                      tone="brand"
                      className="font-semibold"
                    >
                      Edit
                    </AppText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    className="active:opacity-60"
                    disabled={deleteReview.isPending}
                    onPress={() => {
                      const reviewId = eligibility.ownReview.id;
                      if (!reviewId) return;
                      Alert.alert(
                        "Delete your review?",
                        "This can't be undone.",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Delete",
                            style: "destructive",
                            onPress: () => deleteReview.mutate(reviewId),
                          },
                        ],
                      );
                    }}
                  >
                    <AppText
                      variant="small"
                      tone="error"
                      className="font-semibold"
                    >
                      {deleteReview.isPending ? "Deleting…" : "Delete"}
                    </AppText>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {reviewsList.isLoading ? (
              <AppText variant="muted">Loading reviews…</AppText>
            ) : reviews.length === 0 ? (
              <AppText variant="muted">No reviews yet.</AppText>
            ) : (
              <View className="gap-2">
                {reviews.map((r) => (
                  <PlaceReviewCard
                    key={r.id}
                    review={r}
                    onReport={
                      session
                        ? () =>
                            setReportTarget({
                              kind: "review",
                              reviewId: r.id,
                              label: `Review by ${r.reviewer?.username ?? "a guest"}`,
                            })
                        : undefined
                    }
                  />
                ))}
                {reviewsList.hasNextPage ? (
                  <Pressable
                    accessibilityRole="button"
                    className="items-center py-2 active:opacity-60"
                    disabled={reviewsList.isFetchingNextPage}
                    onPress={() => reviewsList.fetchNextPage()}
                  >
                    <AppText
                      variant="small"
                      tone="brand"
                      className="font-semibold"
                    >
                      {reviewsList.isFetchingNextPage
                        ? "Loading…"
                        : "Show more reviews"}
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>

          {/* Upcoming events (item 13) */}
          {upcomingEvents.length > 0 ? (
            <View className="gap-3">
              <SectionTitle>Upcoming events here</SectionTitle>
              <FlatList
                horizontal
                data={upcomingEvents}
                keyExtractor={(e) => e.id}
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-3"
                renderItem={({ item }) => (
                  <View style={{ width: carouselCardWidth }}>
                    <EventCard event={item} />
                  </View>
                )}
              />
            </View>
          ) : null}

          {/* Similar places (item 13) */}
          {similarPlaces.length > 0 ? (
            <View className="gap-3">
              <SectionTitle>Similar places</SectionTitle>
              <FlatList
                horizontal
                data={similarPlaces}
                keyExtractor={(p) => p.id}
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-3"
                renderItem={({ item }) => (
                  <View style={{ width: carouselCardWidth }}>
                    <PlaceCard place={item} />
                  </View>
                )}
              />
            </View>
          ) : null}

          {session && place.owner_id !== session.user.id ? (
            <Pressable
              accessibilityRole="button"
              className="items-center py-2 active:opacity-60"
              onPress={() =>
                setReportTarget({
                  kind: "place",
                  placeId: place.id,
                  label: place.name,
                })
              }
            >
              <AppText variant="caption" tone="muted" className="font-medium">
                Report this place
              </AppText>
            </Pressable>
          ) : null}
        </View>

        <ClaimPlaceSheet
          open={claimOpen}
          onClose={() => setClaimOpen(false)}
          placeId={place.id}
          placeName={place.name}
        />

        <ReportSheet
          open={reportTarget != null}
          onClose={() => setReportTarget(null)}
          target={
            reportTarget ?? {
              kind: "place",
              placeId: place.id,
              label: place.name,
            }
          }
        />

        <BookPlaceSheet
          open={bookOpen}
          onClose={() => setBookOpen(false)}
          placeId={place.id}
          placeName={place.name}
          services={place.services.map((s) => ({ id: s.id, name: s.name }))}
        />

        <PlaceReviewSheet
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          placeId={place.id}
          placeName={place.name}
          existingReview={
            eligibility && !eligibility.canReview
              ? eligibility.reason === "has_review"
                ? eligibility.ownReview
                : null
              : null
          }
        />
      </ScrollView>
    </View>
  );
}
