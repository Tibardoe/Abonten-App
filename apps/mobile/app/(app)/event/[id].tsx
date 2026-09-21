import { useSession } from "@/auth/SessionProvider";
import { DetailHeaderActions } from "@/components/DetailHeaderActions";
import { EventCard } from "@/components/EventCard";
import { EventReminderButton } from "@/components/EventReminderButton";
import { ReportSheet } from "@/components/ReportSheet";
import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { FreeRsvpCard } from "@/components/checkout/FreeRsvpCard";
import { StaticMapPreview } from "@/components/map/StaticMapPreview";
import { AddReviewSheet } from "@/components/reviews/AddReviewSheet";
import { ReviewPhotoStrip } from "@/components/reviews/ReviewPhotoStrip";
import { EventDetailSkeleton } from "@/components/skeletons";
import {
  VerifiedPill,
  showsOrganizerBadge,
} from "@/components/verification/VerifiedPill";
import { useFreeRsvpFlow } from "@/features/checkout/useFreeRsvpFlow";
import { useAttendingEventIds } from "@/features/discovery/useAttendingEventIds";
import { useEventDetail } from "@/features/discovery/useEventDetail";
import { useGeocode } from "@/features/discovery/useGeocode";
import { useSimilarEvents } from "@/features/discovery/useSimilarEvents";
import { useOpenConversation } from "@/features/messaging/useOpenConversation";
import { useEventReviewEligibility } from "@/features/reviews/useEventReviews";
import {
  type EventReviewListItem,
  useEventRating,
  useEventReviewsList,
} from "@/features/reviews/useEventReviewsList";
import { PromoterEarnNote } from "@/features/rewards/PromoterEarnNote";
import {
  logEventShare,
  useReferralCode,
} from "@/features/rewards/useReferralCode";
import { openDirections as openMapsDirections } from "@/lib/directions";
import { isNotFoundError } from "@/lib/queryErrors";
import { eventShareUrl } from "@/lib/share";
import { useNowTick } from "@/lib/useNowTick";
import { useQueryView } from "@/lib/useQueryView";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import {
  formatDateWithSuffix,
  formatFullDateTimeRange,
  getFormattedEventDate,
  getRelativeTime,
} from "@abonten/core/dateFormatter";
import { resolveEventCta } from "@abonten/core/eventCta";
import { resolveOccurrenceState } from "@abonten/core/eventPurchaseEligibility";
import { getEventSoldOutStatus } from "@abonten/core/getEventSoldOutStatus";
import { parseEventTypes } from "@abonten/core/parseEventTypes";
import { hasFreeRegistration } from "@abonten/core/ticketTiers";
import {
  AppText,
  Avatar,
  BottomBar,
  Button,
  Icon,
  type IoniconName,
  Refresher,
  ScreenError,
  SectionTitle,
  Stars,
  useToast,
} from "@abonten/ui-native";
import { useCarouselCardWidth } from "@abonten/ui-native/theme";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  FlatList,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";

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
        <AppText variant="body">{label}</AppText>
        {sub ? <AppText variant="meta">{sub}</AppText> : null}
      </View>
    </View>
  );
}

function ReviewItem({
  review,
  onReport,
}: {
  review: EventReviewListItem;
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
            {review.reviewer?.username ?? "Attendee"}
          </AppText>
        </View>
        <Stars rating={review.rating} size={13} />
      </View>
      {review.is_verified_attendee ? (
        <View className="flex-row items-center gap-1">
          <Icon name="checkmark-circle" size={12} tone="success" />
          <AppText variant="caption" tone="success">
            Verified attendee
          </AppText>
        </View>
      ) : null}
      {review.title ? (
        <AppText variant="small" className="font-semibold">
          {review.title}
        </AppText>
      ) : null}
      {review.comment ? (
        <AppText variant="muted">{review.comment}</AppText>
      ) : null}
      {review.event_review_photo?.length ? (
        <ReviewPhotoStrip photos={review.event_review_photo} />
      ) : null}
      {review.organizer_response ? (
        <View className="ml-3 mt-1 rounded-lg border-l-4 border-primary bg-muted p-3">
          <AppText variant="label" className="mb-1 text-primary">
            Organizer reply
          </AppText>
          <AppText variant="small">{review.organizer_response}</AppText>
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

export default function EventDetailScreen() {
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const similarCardWidth = useCarouselCardWidth();
  const detail = useEventDetail(id);
  const { data, isError, error, isRefetching, refetch } = detail;
  const detailView = useQueryView(detail);
  const { session } = useSession();
  const messageOrganizer = useOpenConversation();
  // Advances every 30s and on foreground so the "ongoing / ended / next
  // date" state below recomputes while the screen sits open across an
  // occurrence boundary (issue §4).
  const nowMs = useNowTick();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    targetType: "event" | "event_review";
    targetId: string;
    label: string;
  } | null>(null);

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
  const referralCode = useReferralCode();
  // Before the loading/offline returns below: hooks can't follow them.
  const rsvpFlow = useFreeRsvpFlow(data?.event);
  const attendingIds = useAttendingEventIds();

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
          shareUrl={eventCode ? eventShareUrl(eventCode, referralCode) : null}
          onShared={() => {
            if (session && data?.event.id) {
              logEventShare(session.user.id, data.event.id, referralCode);
            }
          }}
          onReport={
            session &&
            data?.event.organizer_id &&
            data.event.organizer_id !== session.user.id
              ? () =>
                  setReportTarget({
                    targetType: "event",
                    targetId: data.event.id,
                    label: data.event.title,
                  })
              : undefined
          }
        />
      }
    />
  );

  // Cached data (restored from the last session too) keeps rendering when a
  // refresh fails or the device is offline; only "no longer exists" or
  // "not on this phone" replaces it (useQueryView).
  if (isError && isNotFoundError(error)) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <ScreenError message="This event is no longer available." />
      </View>
    );
  }
  if (!data || detailView.kind !== "content") {
    return (
      <View className="flex-1 bg-background">
        {header}
        <QueryUnavailable
          view={detailView}
          subject="this event"
          onRetry={() => refetch()}
          loading={<EventDetailSkeleton />}
          className="flex-1 justify-center"
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
  // The card-size flyer (EventCard's exact URL) is usually already on disk:
  // it stands in while the large one loads, and offline it is the picture.
  const flyerPlaceholder =
    event.flyer_public_id && event.flyer_version
      ? buildCloudinaryUrl(event.flyer_public_id, event.flyer_version, {
          width: 480,
          height: 320,
        })
      : null;
  // Multi-date events carry their real dates in `event_occurrence` and can
  // have a null top-level starts_at/ends_at — feeding those straight into
  // formatFullDateTimeRange rendered "N/A" / "N/A - N/A". getFormattedEventDate
  // resolves the representative occurrence (same as the web detail page);
  // the full list is rendered below when there's more than one.
  const when = getFormattedEventDate(
    event.starts_at,
    event.ends_at,
    event.event_occurrence,
  );
  const tags = parseEventTypes(event.event_type);
  const canceled = event.status === "canceled";
  const occ = event.event_occurrence ?? [];
  const sortedOccurrences =
    occ.length > 1
      ? [...occ].sort(
          (a, b) =>
            new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
        )
      : [];
  // Authoritative "can a ticket still be sold" state, recomputed on every
  // tick. `ended` = every session is over; `inProgressNoFuture` = a session
  // is happening now but nothing upcoming remains (a single-date event that
  // has started counts here too — walk-up sales are closed). Either way no
  // ticket can be bought; when a future occurrence still exists the event
  // stays purchasable even while an earlier date is mid-run.
  const occurrenceState = resolveOccurrenceState(
    event.starts_at,
    event.ends_at,
    event.event_occurrence,
    nowMs,
  );
  const hasEnded = !canceled && occurrenceState.blockReason === "ended";
  const inProgressNoFuture =
    !canceled && occurrenceState.blockReason === "ongoing_no_future";
  const salesClosed = hasEnded || inProgressNoFuture;
  const soldOut = getEventSoldOutStatus({
    capacity: event.capacity,
    attendeeCount: attendanceCount,
    ticketTypes: event.ticket_type,
  });
  const isFree = hasFreeRegistration(event.ticket_type);
  const reviews = reviewsList.data?.pages.flatMap((p) => p.reviews) ?? [];
  // The page's one primary action, pinned to its foot (resolveEventCta).
  const cta = resolveEventCta({
    canceled,
    ended: hasEnded,
    inProgressNoFuture,
    soldOut,
    ticketTypeCount: event.ticket_type.length,
    isFree,
    attending: attendingIds.has(event.id) || rsvpFlow.done,
  });
  const onCta = () => {
    if (cta.kind === "buy") router.push(`/(app)/buy/${event.id}`);
    else if (cta.kind === "rsvp") void rsvpFlow.submit();
    else if (cta.kind === "going") router.push("/(app)/tickets");
  };
  const multiDateRsvp = cta.kind === "rsvp" && rsvpFlow.occurrences.length > 1;
  const chosenDate = multiDateRsvp
    ? rsvpFlow.occurrences.find((o) => o.id === rsvpFlow.occurrenceId)
    : undefined;

  const openDirections = () => {
    void openMapsDirections({ label: event.title, address, coords }).then(
      (opened) => {
        if (!opened)
          toast.error("Couldn't open maps", {
            description: "No maps app is available on this device.",
          });
      },
    );
  };

  return (
    <View className="flex-1 bg-background">
      {header}
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="pb-12"
        refreshControl={<Refresher onRefresh={() => refetch()} />}
      >
        {/* Hero */}
        <View className="relative h-72 bg-muted">
          {flyer ? (
            <Image
              source={{ uri: flyer }}
              placeholder={
                flyerPlaceholder ? { uri: flyerPlaceholder } : undefined
              }
              placeholderContentFit="cover"
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

        {canceled || salesClosed ? (
          <View className="mx-4 mt-4 rounded-lg border border-destructive/40 bg-muted px-3 py-2">
            <AppText
              variant="small"
              tone="error"
              className="text-center font-medium"
            >
              {canceled
                ? "This event has been canceled."
                : hasEnded
                  ? "This event has ended."
                  : "This event is currently in progress."}
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
                <AppText variant="caption">Organized by</AppText>
                <View className="flex-row items-center gap-1.5">
                  <AppText
                    variant="bodyStrong"
                    numberOfLines={1}
                    className="shrink"
                  >
                    {event.user_info.username}
                  </AppText>
                  {showsOrganizerBadge(event.user_info) ? (
                    <VerifiedPill subjectType="organizer" />
                  ) : null}
                </View>
                <View className="mt-0.5 flex-row items-center gap-1">
                  <Stars rating={organizerRating.average} size={12} />
                  <AppText variant="caption">
                    ({organizerRating.average.toFixed(1)})
                  </AppText>
                </View>
              </View>
              <View className="items-end gap-1">
                <AppText variant="caption">
                  {getRelativeTime(event.created_at)}
                </AppText>
                <Icon name="chevron-forward" size={16} tone="muted" />
              </View>
            </Pressable>
          ) : null}

          {!canceled && !salesClosed ? (
            <PromoterEarnNote
              eventId={event.id}
              organizerId={event.organizer_id}
            />
          ) : null}

          {session && event.organizer_id !== session.user.id ? (
            <Button
              title="Message organizer"
              variant="outline"
              leftIcon="chatbubble-ellipses-outline"
              loading={messageOrganizer.isPending}
              onPress={() =>
                messageOrganizer.mutate(
                  { type: "event", eventId: id },
                  {
                    onSuccess: (res) => {
                      if (res.status !== 200) {
                        toast.error("Can't start a conversation", {
                          description: res.message ?? "Please try again.",
                        });
                      }
                    },
                    onError: () =>
                      toast.error("Can't start a conversation", {
                        description: "Please try again.",
                      }),
                  },
                )
              }
            />
          ) : null}

          {/* Date / location / attendance */}
          <View className="gap-3 rounded-xl border border-border bg-card p-4">
            {sortedOccurrences.length > 1 ? (
              <View className="flex-row gap-3">
                <Icon
                  name="calendar-outline"
                  size={18}
                  tone="muted"
                  style={{ marginTop: 2 }}
                />
                <View className="flex-1 gap-1">
                  <AppText variant="body">
                    {sortedOccurrences.length} dates
                  </AppText>
                  {sortedOccurrences.map((o) => {
                    const w = formatFullDateTimeRange(o.starts_at, o.ends_at);
                    return (
                      <AppText key={o.id} variant="meta">
                        {w.date} · {w.time}
                      </AppText>
                    );
                  })}
                </View>
              </View>
            ) : (
              <InfoRow
                icon="calendar-outline"
                label={when.date}
                sub={when.time}
              />
            )}
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

            {coords ? (
              <StaticMapPreview
                coords={coords}
                label={address ?? event.title}
                onPress={openDirections}
              />
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
                  onPress={() => router.push(`/(app)/place/${event.place?.id}`)}
                />
              ) : null}
            </View>
          </View>

          {(() => {
            // Specific-date events have starts_at null — fall back to the
            // next upcoming occurrence so multi-date events get a reminder.
            const times = occ
              .map((o) => String(o.starts_at))
              .filter(Boolean)
              .sort();
            const remindStart =
              event.starts_at ??
              times.find((s) => new Date(s).getTime() > Date.now()) ??
              times[0] ??
              null;
            return !canceled && !salesClosed && remindStart ? (
              <EventReminderButton
                eventId={event.id}
                eventTitle={event.title}
                startsAtIso={remindStart}
                status={event.status}
              />
            ) : null;
          })()}

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
              <AppText variant="body" tone="muted">
                {event.description}
              </AppText>
            </View>
          ) : null}

          {/* Category + tags */}
          <View className="gap-2">
            <SectionTitle>Category &amp; tags</SectionTitle>
            <View className="flex-row flex-wrap gap-2">
              <View className="rounded-full bg-muted px-3 py-1">
                <AppText variant="meta">{event.event_category}</AppText>
              </View>
              {tags.map((t) => (
                <View key={t} className="rounded-full bg-muted px-3 py-1">
                  <AppText variant="meta">#{t}</AppText>
                </View>
              ))}
            </View>
          </View>

          {/* Tickets / checkout */}
          <View className="gap-3">
            <SectionTitle>Tickets</SectionTitle>
            {canceled ? (
              <View className="items-center rounded-xl bg-muted px-4 py-3">
                <AppText variant="muted" className="font-semibold">
                  Tickets unavailable — this event was canceled.
                </AppText>
              </View>
            ) : salesClosed ? (
              <View className="items-center rounded-xl bg-muted px-4 py-3">
                <AppText variant="muted" className="font-semibold">
                  {hasEnded
                    ? "This event has ended."
                    : "This event is in progress — ticket sales are closed."}
                </AppText>
              </View>
            ) : soldOut ? (
              <View className="items-center rounded-xl bg-muted px-4 py-3">
                <AppText variant="muted" className="font-semibold">
                  Sold out
                </AppText>
              </View>
            ) : event.ticket_type.length === 0 ? (
              <AppText variant="muted">
                No tickets have been set up for this event yet.
              </AppText>
            ) : isFree ? (
              <FreeRsvpCard event={event} flow={rsvpFlow} showAction={false} />
            ) : (
              <View className="gap-3 rounded-xl border border-border bg-card p-4">
                <View className="flex-row items-center justify-between">
                  <View>
                    <AppText variant="caption">Tickets</AppText>
                    <AppText variant="cardTitle">
                      {priceRange(event.ticket_type)}
                    </AppText>
                  </View>
                  <Icon name="ticket-outline" size={22} tone="muted" />
                </View>
                {/* The Buy button is the sticky bar at the foot of the page. */}
                <AppText variant="meta">
                  {event.ticket_type.length > 1
                    ? `${event.ticket_type.length} ticket types — choose yours at checkout.`
                    : "Choose how many at checkout."}
                </AppText>
              </View>
            )}
          </View>

          {/* Reviews */}
          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <SectionTitle>Reviews</SectionTitle>
              {rating.data && rating.data.count > 0 ? (
                <View className="flex-row items-center gap-1.5">
                  <Stars rating={rating.data.average} size={14} />
                  <AppText variant="meta">
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
                {eligibility.ownReview.event_review_photo?.length ? (
                  <ReviewPhotoStrip
                    photos={eligibility.ownReview.event_review_photo}
                  />
                ) : null}
              </View>
            ) : null}

            {reviewsList.isLoading ? (
              <AppText variant="muted">Loading reviews…</AppText>
            ) : reviews.length === 0 ? (
              <AppText variant="muted">No reviews yet.</AppText>
            ) : (
              <View className="gap-2">
                {reviews.map((r) => (
                  <ReviewItem
                    key={r.id}
                    review={r}
                    onReport={
                      session
                        ? () =>
                            setReportTarget({
                              targetType: "event_review",
                              targetId: r.id,
                              label: `Review by ${r.reviewer?.username ?? "an attendee"}`,
                            })
                        : undefined
                    }
                  />
                ))}
                {reviewsList.hasNextPage ? (
                  <Pressable
                    accessibilityRole="button"
                    className="items-center py-2 active:opacity-60"
                    onPress={() => reviewsList.fetchNextPage()}
                    disabled={reviewsList.isFetchingNextPage}
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
                  <View style={{ width: similarCardWidth }}>
                    <EventCard event={item} />
                  </View>
                )}
              />
            </View>
          ) : null}

          {session && event.organizer_id !== session.user.id ? (
            <Pressable
              accessibilityRole="button"
              className="items-center py-2 active:opacity-60"
              onPress={() =>
                setReportTarget({
                  targetType: "event",
                  targetId: event.id,
                  label: event.title,
                })
              }
            >
              <AppText variant="caption" tone="muted" className="font-medium">
                Report this event
              </AppText>
            </Pressable>
          ) : null}
        </View>

        <AddReviewSheet
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          eventId={event.id}
          eventTitle={event.title}
        />

        <ReportSheet
          open={reportTarget != null}
          onClose={() => setReportTarget(null)}
          targetType={reportTarget?.targetType ?? "event"}
          targetId={reportTarget?.targetId ?? event.id}
          label={reportTarget?.label ?? event.title}
        />
      </ScrollView>

      {/* Sticky primary action. In the flex column under the ScrollView (not
          floating over it), so it never covers content; BottomBar pads it
          clear of the home indicator / gesture bar and collapses that pad
          when a keyboard is up. It always says what the page's state is —
          buy, reserve, your ticket, or why nothing can be bought. */}
      <BottomBar>
        <View className="flex-row items-center gap-3">
          <View className="flex-1">
            {cta.kind === "going" ? (
              <>
                <AppText variant="caption" tone="success">
                  You're going
                </AppText>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {when.date} · {when.time}
                </AppText>
              </>
            ) : (
              <>
                <AppText variant="caption" numberOfLines={1}>
                  {chosenDate
                    ? `Date · ${formatDateWithSuffix(chosenDate.starts_at)}`
                    : cta.actionable
                      ? "Tickets"
                      : "Tickets unavailable"}
                </AppText>
                <AppText variant="cardTitle" numberOfLines={1}>
                  {event.ticket_type.length > 0
                    ? priceRange(event.ticket_type)
                    : "—"}
                </AppText>
              </>
            )}
          </View>
          <Button
            title={
              cta.kind === "rsvp" && rsvpFlow.pending ? "Reserving…" : cta.label
            }
            variant={cta.kind === "going" ? "outline" : "primary"}
            disabled={!cta.actionable}
            loading={cta.kind === "rsvp" && rsvpFlow.pending}
            onPress={onCta}
            accessibilityHint={
              cta.kind === "buy"
                ? "Opens ticket selection"
                : cta.kind === "rsvp"
                  ? "Reserves a free ticket"
                  : undefined
            }
          />
        </View>
      </BottomBar>
    </View>
  );
}
