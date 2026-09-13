import { EventCard, EventCardSkeleton } from "@/components/EventCard";
import { AppHeader, HeaderIconButton } from "@/components/app/AppHeader";
import { WeeklySectionView } from "@/components/weekly/WeeklySectionView";
import { useExploreLocation } from "@/features/discovery/ExploreLocationProvider";
import { useWeeklyEdition } from "@/features/weekly/useWeekly";
import { shareLink, weeklyShareUrl } from "@/lib/share";
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
  Refresher,
  ScreenError,
  Skeleton,
} from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { ScrollView, View } from "react-native";

// Abonten Weekly in the app: this week's edition for the explored area (or a
// scope / dated edition from a shared link), laid out section by section.
// Pull to refresh; honest notices when Ghana-wide or last week's picks are
// shown; never a dead end when nothing is out.

function Masthead({ doc }: { doc: WeeklyEditionDocument }) {
  const e = doc.edition;
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
    <View className="mx-4 gap-2 rounded-2xl border border-border bg-card p-5">
      <AppText variant="overline" tone="brand">
        ✨ {WEEKLY_PRODUCT_NAME} · {e.scopeName}
      </AppText>
      <AppText variant="pageTitle" accessibilityRole="header">
        {e.title}
      </AppText>
      <AppText variant="meta">{formatWeekRange(e.weekStart)}</AppText>
      <AppText variant="bodyLg">{e.subtitle ?? WEEKLY_TAGLINE}</AppText>
      {weeklyParagraphs(e.intro).map((p) => (
        <AppText key={p} variant="muted">
          {p}
        </AppText>
      ))}
      {notices.map((n) => (
        <View
          key={n}
          className="mt-1 self-start rounded-full bg-muted px-3 py-1"
        >
          <AppText variant="caption">{n}</AppText>
        </View>
      ))}
    </View>
  );
}

function WeeklySkeleton() {
  return (
    <View className="gap-6 pt-4" accessibilityLabel="Loading Abonten Weekly">
      <View className="mx-4 gap-3 rounded-2xl border border-border p-5">
        <Skeleton width={140} height={12} />
        <Skeleton width="80%" height={28} />
        <Skeleton width={120} height={14} />
        <Skeleton width="95%" height={18} />
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
  const query = useWeeklyEdition({
    scope,
    week,
    lat: location?.lat,
    lng: location?.lng,
  });
  const state = query.data;
  const doc = state?.edition ?? null;

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
      {query.isLoading ? (
        <WeeklySkeleton />
      ) : query.isError ? (
        <ScreenError
          message="Couldn't load Abonten Weekly. Check your connection and try again."
          onRetry={() => query.refetch()}
        />
      ) : (
        <ScrollView
          contentContainerClassName="gap-7 pt-4 pb-16"
          refreshControl={
            <Refresher
              refreshing={query.isRefetching}
              onRefresh={() => query.refetch()}
            />
          }
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
