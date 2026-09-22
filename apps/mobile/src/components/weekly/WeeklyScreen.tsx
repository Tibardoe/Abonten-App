import { EventCard, EventCardSkeleton } from "@/components/EventCard";
import { AppHeader, HeaderIconButton } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { WeeklyBanner } from "@/components/weekly/WeeklyBanner";
import { WeeklySectionView } from "@/components/weekly/WeeklySectionView";
import {
  WeeklyChip,
  weeklyListingPath,
} from "@/components/weekly/weeklyBannerParts";
import { useExploreLocation } from "@/features/discovery/ExploreLocationProvider";
import { useWeeklyEdition } from "@/features/weekly/useWeekly";
import { hapticLight } from "@/lib/haptics";
import { weeklyShareUrl } from "@/lib/share";
import { useQueryView } from "@/lib/useQueryView";
import { useShareLink } from "@/lib/useShareLink";
import { weeklyBannerSlides } from "@abonten/core/weekly/bannerSlides";
import {
  WEEKLY_PRODUCT_NAME,
  WEEKLY_TAGLINE,
  weeklyShareText,
} from "@abonten/core/weekly/copy";
import { weeklyParagraphs } from "@abonten/core/weekly/editorialText";
import { formatWeekRange } from "@abonten/core/weekly/week";
import type { WeeklyEditionDocument } from "@abonten/types/weeklyType";
import {
  AppText,
  EmptyState,
  Icon,
  Refresher,
  ScreenError,
  Skeleton,
} from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { ScrollView, View, useWindowDimensions } from "react-native";

// Abonten Weekly in the app: this week's edition for the explored area (or a
// scope / dated edition from a shared link), laid out section by section.
// Pull to refresh; honest notices when Ghana-wide or last week's picks are
// shown; never a dead end when nothing is out.

function Masthead({ doc }: { doc: WeeklyEditionDocument }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const e = doc.edition;
  const slides = weeklyBannerSlides(doc.sections);
  const intro = weeklyParagraphs(e.intro);
  const pickCount = doc.sections.reduce((n, s) => n + s.items.length, 0);
  const height = Math.round(Math.min(Math.max(width * 1.15, 420), 560));
  const notices = [
    doc.isFallbackScope
      ? "There is no edition for your area this week, so these are Ghana-wide picks."
      : null,
    doc.isPreviousWeek
      ? "This week's edition is on its way. Here is last week's."
      : null,
    e.weekIsOver && !doc.isPreviousWeek
      ? "A past edition. Some events have already happened."
      : null,
  ].filter((n): n is string => !!n);

  return (
    <View className="gap-4">
      <WeeklyBanner
        slides={slides}
        height={height}
        onSlidePress={(slide) => {
          hapticLight();
          router.push(weeklyListingPath(slide));
        }}
        eyebrow={
          <>
            <WeeklyChip strong>
              ✨ {WEEKLY_PRODUCT_NAME} · {e.scopeName}
            </WeeklyChip>
            <WeeklyChip>{formatWeekRange(e.weekStart)}</WeeklyChip>
          </>
        }
      >
        <AppText
          accessibilityRole="header"
          className="text-[34px] font-extrabold leading-[37px] text-white"
          numberOfLines={3}
        >
          {e.title}
        </AppText>
        <AppText
          className="mt-2 text-[15px] leading-[21px]"
          style={{ color: "rgba(255,255,255,0.86)" }}
          numberOfLines={3}
        >
          {e.subtitle ?? WEEKLY_TAGLINE}
        </AppText>
        <AppText
          className="mt-3 text-[12px] font-semibold uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.7)" }}
        >
          {pickCount} {pickCount === 1 ? "pick" : "picks"} this week
        </AppText>
      </WeeklyBanner>

      {intro.length > 0 ? (
        <View className="mx-4 gap-2 rounded-3xl border border-border bg-card p-5">
          <AppText variant="overline" tone="brand">
            From the editors
          </AppText>
          {intro.map((p) => (
            <AppText key={p} variant="bodyLg">
              {p}
            </AppText>
          ))}
        </View>
      ) : null}
      {notices.map((n) => (
        <View
          key={n}
          className="mx-4 flex-row items-start gap-2.5 rounded-2xl border border-border bg-muted p-3.5"
        >
          <Icon name="information-circle-outline" size={18} tone="primary" />
          <AppText variant="body" className="flex-1">
            {n}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function WeeklySkeleton() {
  return (
    <View className="gap-6 pt-4" accessibilityLabel="Loading Abonten Weekly">
      <View className="mx-4 overflow-hidden rounded-3xl">
        <Skeleton width="100%" height={440} radius={24} />
      </View>
      <View className="gap-3 px-4">
        <Skeleton width={180} height={20} />
        <EventCardSkeleton />
      </View>
    </View>
  );
}

export function WeeklyScreen({
  scope,
  week,
}: {
  scope?: string;
  week?: string;
}) {
  const router = useRouter();
  const { location } = useExploreLocation();
  const shareLink = useShareLink();
  const query = useWeeklyEdition({
    scope,
    week,
    lat: location?.lat,
    lng: location?.lng,
  });
  const state = query.data;
  const doc = state?.edition ?? null;
  // "This edition isn't available" is only ever said for an answer the
  // server gave; loading, offline and failed are told apart (the edition
  // is cached on disk, so a saved one still opens offline).
  const view = useQueryView(query);

  const share = doc
    ? () =>
        shareLink(
          weeklyShareText(doc.edition.title, doc.edition.scopeName),
          weeklyShareUrl(doc.edition.scopeSlug, doc.edition.weekStart),
        )
    : undefined;

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="title"
        title={WEEKLY_PRODUCT_NAME}
        backFallback="/(app)/(tabs)"
        rightAccessory={
          share ? (
            <HeaderIconButton
              name="share-outline"
              onPress={share}
              accessibilityLabel="Share this edition"
            />
          ) : undefined
        }
      />
      {view.kind !== "content" && view.kind !== "empty" ? (
        <QueryUnavailable
          view={view}
          subject={WEEKLY_PRODUCT_NAME}
          onRetry={() => query.refetch()}
          loading={<WeeklySkeleton />}
        />
      ) : (
        <ScrollView
          contentContainerClassName="gap-7 pt-4 pb-16"
          refreshControl={<Refresher onRefresh={() => query.refetch()} />}
        >
          {doc ? (
            <>
              <Masthead doc={doc} />
              {doc.sections.map((section) => (
                <WeeklySectionView key={section.id} section={section} />
              ))}
            </>
          ) : (
            <>
              <EmptyState
                icon="sparkles-outline"
                title={
                  !state?.available || state.notFound
                    ? "This edition isn't available"
                    : "This week's edition is on its way"
                }
                description={
                  !state?.available || state.notFound
                    ? "It may have been taken down, or it isn't out yet."
                    : WEEKLY_TAGLINE
                }
                actionLabel="Explore events and places"
                onAction={() => router.replace("/(app)/(tabs)")}
              />
              {(state?.fallbackEvents ?? []).length > 0 ? (
                <View className="gap-3 px-4">
                  <AppText variant="sectionTitle" accessibilityRole="header">
                    Happening this week
                  </AppText>
                  {state?.fallbackEvents.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
