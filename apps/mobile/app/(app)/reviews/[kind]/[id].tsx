import { useSession } from "@/auth/SessionProvider";
import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { OwnReviewCard } from "@/components/reviews/OwnReviewCard";
import { ReviewCard } from "@/components/reviews/ReviewCard";
import { ReviewSummaryCard } from "@/components/reviews/ReviewSummaryCard";
import { ReviewCardsSkeleton } from "@/components/reviews/ReviewsPreviewSection";
import { useReviewInteractions } from "@/components/reviews/useReviewInteractions";
import { useEventDetail } from "@/features/discovery/useEventDetail";
import { usePlaceDetail } from "@/features/places/usePlaceDetail";
import {
  type ReviewSubject,
  useOwnReview,
} from "@/features/reviews/useReviewSubject";
import {
  useReviewList,
  useReviewSummary,
  useSharedReview,
} from "@/features/reviews/useReviews";
import { isNotFoundError } from "@/lib/queryErrors";
import { useQueryView } from "@/lib/useQueryView";
import type { QueryView } from "@abonten/core/query/queryView";
import {
  REVIEW_SORTS,
  type ReviewListRow,
  type ReviewRatingFilter,
  type ReviewSort,
  type ReviewSubjectKind,
  emptyReviewsMessage,
  parseSharedReviewId,
} from "@abonten/core/reviews/reviewList";
import {
  AppText,
  Button,
  Chip,
  EmptyState,
  Icon,
  ListFooter,
  Refresher,
  ScreenError,
  SegmentedTabs,
} from "@abonten/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  type ReactElement,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { FlatList, Pressable, ScrollView, View } from "react-native";

// Every review of one event or place: the rating breakdown, your own review,
// a star filter, "Most helpful" / "Most recent", and an infinitely scrolling
// list that fetches ten at a time (review_list keyset pages, so a filter
// holds on every page and nothing repeats or goes missing as people post).
// Opened from a details screen's "See all", or from a shared review link
// (?review=<id>), in which case that review is pinned at the top.

const RATING_FILTERS: { value: ReviewRatingFilter; label: string }[] = [
  { value: null, label: "All" },
  { value: 5, label: "5 ★" },
  { value: 4, label: "4 ★" },
  { value: 3, label: "3 ★" },
  { value: 2, label: "2 ★" },
  { value: 1, label: "1 ★" },
];

function useSubject(
  kind: ReviewSubjectKind,
  id: string | undefined,
): {
  subject: ReviewSubject | undefined;
  query: ReturnType<typeof useEventDetail> | ReturnType<typeof usePlaceDetail>;
  view: QueryView;
} {
  const event = useEventDetail(kind === "event" ? id : undefined);
  const place = usePlaceDetail(kind === "place" ? id : undefined);
  const eventView = useQueryView(event);
  const placeView = useQueryView(place);
  const subject = useMemo<ReviewSubject | undefined>(() => {
    if (kind === "event" && event.data) {
      const e = event.data.event;
      return {
        kind,
        id: e.id,
        title: e.title,
        slug: e.event_code ?? null,
        ownerId: e.organizer_id,
        event: {
          id: e.id,
          organizer_id: e.organizer_id,
          status: e.status,
          starts_at: e.starts_at,
          ends_at: e.ends_at,
          event_occurrence: e.event_occurrence,
        },
      };
    }
    if (kind === "place" && place.data) {
      const p = place.data;
      return {
        kind,
        id: p.id,
        title: p.name,
        slug: p.slug ?? null,
        ownerId: p.owner_id ?? null,
      };
    }
    return undefined;
  }, [kind, event.data, place.data]);
  return {
    subject,
    query: kind === "event" ? event : place,
    view: kind === "event" ? eventView : placeView,
  };
}

export default function ReviewsScreen() {
  const params = useLocalSearchParams<{
    kind: string;
    id: string;
    review?: string;
  }>();
  const router = useRouter();
  const { session } = useSession();
  const kind: ReviewSubjectKind = params.kind === "place" ? "place" : "event";
  const validKind = params.kind === "event" || params.kind === "place";
  const sharedId = parseSharedReviewId(params.review);

  const [rating, setRating] = useState<ReviewRatingFilter>(null);
  const [sort, setSort] = useState<ReviewSort>("helpful");
  const listRef = useRef<FlatList<ReviewListRow>>(null);

  const {
    subject,
    query: subjectQuery,
    view: subjectView,
  } = useSubject(kind, params.id);
  const summary = useReviewSummary(kind, params.id);
  const list = useReviewList(kind, params.id, { rating, sort });
  const shared = useSharedReview(kind, params.id, sharedId);
  const own = useOwnReview(subject);
  const interactions = useReviewInteractions(subject);

  // A shared link to your own review opens on your own card instead.
  const sharedRow =
    shared.data && shared.data.reviewerId !== session?.user.id
      ? shared.data
      : null;
  const rows = useMemo(() => {
    const all = list.data?.pages.flatMap((p) => p.reviews) ?? [];
    // The pinned shared review isn't repeated further down.
    return sharedRow ? all.filter((r) => r.id !== sharedRow.id) : all;
  }, [list.data, sharedRow]);
  const listView = useQueryView(list, (d) =>
    d.pages.every((p) => p.reviews.length === 0),
  );

  const changeFilter = useCallback((next: ReviewRatingFilter) => {
    setRating(next);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const header = (
    <AppHeader
      variant="detail"
      title="Reviews"
      backFallback={params.id ? `/(app)/${kind}/${params.id}` : "/(app)/(tabs)"}
    />
  );

  if (!validKind || !params.id) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <ScreenError message="These reviews couldn't be found." />
      </View>
    );
  }
  if (subjectQuery.isError && isNotFoundError(subjectQuery.error)) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <ScreenError
          message={`This ${kind} is no longer available, so its reviews aren't either.`}
        />
      </View>
    );
  }
  if (!subject) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <QueryUnavailable
          view={subjectView}
          subject="these reviews"
          onRetry={() => subjectQuery.refetch()}
          loading={
            <View className="p-4">
              <ReviewCardsSkeleton count={4} />
            </View>
          }
          className="flex-1 justify-center"
        />
      </View>
    );
  }

  const total = summary.data?.total ?? 0;
  const empty = emptyReviewsMessage(rating, kind);

  const listHeader = (
    <View className="gap-4 pb-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${subject.title}`}
        onPress={() => router.push(`/(app)/${kind}/${subject.id}`)}
        className="flex-row items-center gap-1 active:opacity-60"
      >
        <AppText variant="bodyStrong" numberOfLines={1} className="shrink">
          {subject.title}
        </AppText>
        <Icon name="chevron-forward" size={14} tone="muted" />
      </Pressable>

      {summary.data && total > 0 ? (
        <ReviewSummaryCard
          summary={summary.data}
          selected={rating}
          onSelect={changeFilter}
        />
      ) : null}

      {own.state === "can_review" ||
      (own.state === "signed_out" && kind === "place") ? (
        <Button
          title="Write a review"
          variant="outline"
          leftIcon="create-outline"
          onPress={() => interactions.openComposer()}
        />
      ) : own.state === "has_review" ? (
        <OwnReviewCard
          review={own.review}
          kind={subject.kind}
          onMore={() => interactions.openOwnMenu(own.review)}
        />
      ) : null}

      {sharedRow ? (
        <ReviewCard
          review={sharedRow}
          kind={kind}
          highlighted
          {...interactions.cardProps(sharedRow)}
        />
      ) : sharedId && shared.isSuccess && !shared.data ? (
        <View className="flex-row items-center gap-2 rounded-xl bg-muted p-3">
          <Icon name="information-circle-outline" size={16} tone="muted" />
          <AppText variant="small" tone="muted" className="flex-1">
            The review you opened is no longer available.
          </AppText>
        </View>
      ) : null}

      {total > 0 ? (
        <View className="gap-3">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
            accessibilityRole="tablist"
          >
            {RATING_FILTERS.map((f) => (
              <Chip
                key={f.label}
                label={
                  f.value && summary.data
                    ? `${f.label} · ${summary.data.counts[f.value].toLocaleString("en-US")}`
                    : f.label
                }
                selected={rating === f.value}
                showCheck
                onPress={() => changeFilter(f.value)}
              />
            ))}
          </ScrollView>
          <SegmentedTabs
            options={REVIEW_SORTS.map((s) => ({
              key: s.value,
              label: s.label,
            }))}
            value={sort}
            onChange={(next) => {
              setSort(next);
              listRef.current?.scrollToOffset({ offset: 0, animated: false });
            }}
          />
        </View>
      ) : null}
    </View>
  );

  let emptyComponent: ReactElement | null = null;
  if (listView.kind === "loading") {
    emptyComponent = <ReviewCardsSkeleton count={3} />;
  } else if (listView.kind === "offline" || listView.kind === "error") {
    emptyComponent = (
      <QueryUnavailable
        view={listView}
        subject="these reviews"
        onRetry={() => list.refetch()}
        className="py-10"
      />
    );
  } else if (rows.length === 0 && !sharedRow) {
    emptyComponent =
      own.state === "has_review" && !rating ? (
        <AppText variant="muted" className="py-6 text-center">
          Yours is the only review so far.
        </AppText>
      ) : (
        <EmptyState
          icon="chatbox-ellipses-outline"
          title={empty.title}
          description={
            !rating && own.state === "not_eligible"
              ? own.message
              : empty.description
          }
          actionLabel={rating ? "Show all reviews" : undefined}
          onAction={rating ? () => changeFilter(null) : undefined}
          className="py-10"
        />
      );
  }

  return (
    <View className="flex-1 bg-background">
      {header}
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerClassName="gap-2 p-4 pb-12"
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyComponent}
        renderItem={({ item }) => (
          <ReviewCard
            review={item}
            kind={kind}
            {...interactions.cardProps(item)}
          />
        )}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) {
            void list.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.6}
        refreshControl={
          <Refresher
            onRefresh={() =>
              Promise.all([
                list.refetch(),
                summary.refetch(),
                sharedId ? shared.refetch() : null,
                subjectQuery.refetch(),
              ])
            }
          />
        }
        ListFooterComponent={
          <ListFooter
            count={rows.length}
            isFetchingNextPage={list.isFetchingNextPage}
            hasNextPage={list.hasNextPage}
            isError={list.isFetchNextPageError}
            onRetry={() => list.fetchNextPage()}
          />
        }
        initialNumToRender={6}
        windowSize={9}
      />
      {interactions.sheets}
    </View>
  );
}
