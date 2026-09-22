import { useSession } from "@/auth/SessionProvider";
import { EventCard } from "@/components/EventCard";
import { PlaceCard } from "@/components/PlaceCard";
import { ReportSheet } from "@/components/ReportSheet";
import { AppHeader, HeaderIconButton } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { CreateActionSheet } from "@/components/profile/CreateActionSheet";
import { ListingKindMenu } from "@/components/profile/ListingKindMenu";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileReviewRow } from "@/components/profile/ProfileRows";
import { ProfileTabBar, type Rect } from "@/components/profile/ProfileTabBar";
import { SpotlightTileRow } from "@/components/profile/SpotlightGrid";
import { ProfileSkeleton } from "@/components/skeletons";
import {
  useOwnSpotlights,
  usePublisherSpotlights,
  useSavedSpotlights,
} from "@/features/content/useContent";
import { useContentProgram } from "@/features/content/useContentProgram";
import {
  useProfileEvents,
  useProfileFavoriteEvents,
  useProfileFavoritePlaces,
  useProfilePlaceReviews,
  useProfilePlaces,
  useProfileReviews,
} from "@/features/profile/useProfileTabs";
import { usePublicProfile } from "@/features/profile/usePublicProfile";
import { isNotFoundError } from "@/lib/queryErrors";
import { useQueryView } from "@/lib/useQueryView";
import {
  type ListingKind,
  type ProfileTab,
  type SpotlightSegment,
  type SpotlightTile,
  chunkRows,
  profileTabs,
  spotlightSegments,
  tileFromDocument,
  tileFromOwnPost,
} from "@abonten/core/content/profileContent";
import type {
  ContentOwnPost,
  ContentPostDocument,
} from "@abonten/types/contentType";
import {
  EmptyState,
  Refresher,
  ScreenError,
  SegmentedTabs,
  Spinner,
} from "@abonten/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

type FavSub = "events" | "places";
type ReviewSub = "event" | "place";

const SEGMENT_LABEL: Record<SpotlightSegment, string> = {
  published: "Published",
  saved: "Saved",
  drafts: "Drafts",
};

type GridRow = { id: string; tiles: SpotlightTile[] };

export default function UserProfileScreen() {
  const params = useLocalSearchParams<{
    username: string;
    tab?: string;
    segment?: string;
  }>();
  const { username } = params;
  const router = useRouter();
  const { session } = useSession();
  const { program } = useContentProgram();

  const profileQuery = usePublicProfile(username);
  const profile = profileQuery.data;
  // A cached profile (this session or restored from the last one) always
  // renders; loading, offline and failed are told apart only for a profile
  // never loaded here.
  const profileView = useQueryView(profileQuery);
  const isOwn = !!session && session.user.id === profile?.user_id;

  // A link can open a tab directly (Account › Saved Spotlights opens
  // ?tab=spotlights&segment=saved); unknown values fall back below.
  const [tab, setTab] = useState<ProfileTab>(
    (params.tab as ProfileTab | undefined) ?? "listings",
  );
  const [listingKind, setListingKind] = useState<ListingKind>("events");
  const [listingMenu, setListingMenu] = useState<Rect | null>(null);
  const [segment, setSegment] = useState<SpotlightSegment>(
    (params.segment as SpotlightSegment | undefined) ?? "published",
  );
  const [favSub, setFavSub] = useState<FavSub>("events");
  const [reviewSub, setReviewSub] = useState<ReviewSub>("event");
  const [createOpen, setCreateOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  // A quick content cross-fade on every tab / sub-tab change: the list data
  // swaps instantly (React Query serves each tab from cache — no refetch),
  // and a 90ms dip-and-restore stops that swap reading as a hard cut. The
  // list itself is never remounted, so scroll naturally resets to the top of
  // the new tab, which is the right behaviour here.
  const reduceMotion = useReducedMotion();
  const contentOpacity = useSharedValue(1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the tab state values are the triggers, not read in the body
  useEffect(() => {
    if (reduceMotion) return;
    contentOpacity.value = withSequence(
      withTiming(0.45, { duration: 90 }),
      withTiming(1, { duration: 130 }),
    );
  }, [
    tab,
    listingKind,
    segment,
    favSub,
    reviewSub,
    reduceMotion,
    contentOpacity,
  ]);
  const contentStyle = useAnimatedStyle(() => ({
    flex: 1,
    opacity: contentOpacity.value,
  }));

  const tabs = useMemo(
    () => profileTabs({ isOwn, spotlightOn: program.spotlight }),
    [isOwn, program.spotlight],
  );
  const segments = spotlightSegments(isOwn);
  // The programme can switch off (or the profile turn out to be someone
  // else's) after a tab was chosen: fall back to a tab that still exists.
  const currentTab: ProfileTab = tabs.includes(tab) ? tab : "listings";
  const currentSegment: SpotlightSegment = segments.includes(segment)
    ? segment
    : "published";

  // Standard detail header: back (left) + centred @username. On your own
  // profile the "+" create button sits on the LEFT (next to back) and the
  // Settings shortcut is the right-hand contextual action. No bell.
  const navHeader = (
    <AppHeader
      variant="detail"
      title={username ? `@${username}` : "Profile"}
      backFallback="/(app)"
      leftAccessory={
        isOwn ? (
          <HeaderIconButton
            name="add"
            accessibilityLabel="Create"
            onPress={() => setCreateOpen(true)}
          />
        ) : undefined
      }
      rightAccessory={
        isOwn ? (
          <HeaderIconButton
            name="settings-outline"
            accessibilityLabel="Settings"
            onPress={() => router.push("/(app)/settings")}
          />
        ) : session ? (
          <HeaderIconButton
            name="flag-outline"
            accessibilityLabel="Report this user"
            onPress={() => setReportOpen(true)}
          />
        ) : undefined
      }
    />
  );

  const onSpotlights = currentTab === "spotlights";
  const events = useProfileEvents(profile?.user_id);
  const places = useProfilePlaces(profile?.user_id);
  const favEvents = useProfileFavoriteEvents(
    currentTab === "favorites" && favSub === "events",
  );
  const favPlaces = useProfileFavoritePlaces(
    currentTab === "favorites" && favSub === "places",
  );
  const reviews = useProfileReviews(profile?.user_id);
  const placeReviews = useProfilePlaceReviews(profile?.user_id);
  // Saved and drafts are requested only for your own profile, and only
  // while that segment is open.
  const publicSpotlights = usePublisherSpotlights(
    "organizer",
    profile?.user_id,
    onSpotlights && !isOwn && program.spotlight,
  );
  const ownPublished = useOwnSpotlights(
    "published",
    onSpotlights && isOwn && currentSegment === "published",
  );
  const ownDrafts = useOwnSpotlights(
    "draft",
    onSpotlights && isOwn && currentSegment === "drafts",
  );
  const saved = useSavedSpotlights(
    onSpotlights && isOwn && currentSegment === "saved",
  );

  const spotlightQuery = !isOwn
    ? publicSpotlights
    : currentSegment === "saved"
      ? saved
      : currentSegment === "drafts"
        ? ownDrafts
        : ownPublished;

  const active =
    currentTab === "listings"
      ? listingKind === "events"
        ? events
        : places
      : currentTab === "spotlights"
        ? spotlightQuery
        : currentTab === "reviews"
          ? reviewSub === "event"
            ? reviews
            : placeReviews
          : favSub === "events"
            ? favEvents
            : favPlaces;

  const rows = useMemo<{ id: string }[]>(() => {
    if (currentTab === "spotlights") {
      const pages = (spotlightQuery.data?.pages ?? []) as {
        posts: (ContentOwnPost | ContentPostDocument)[];
      }[];
      const tiles = pages
        .flatMap((p) => p.posts)
        .map((post) =>
          "cover" in post ? tileFromOwnPost(post) : tileFromDocument(post),
        );
      return chunkRows(tiles, 3).map(
        (row): GridRow => ({ id: row[0].id, tiles: row }),
      );
    }
    const pages = (active.data?.pages ?? []) as { rows: { id: string }[] }[];
    return pages.flatMap((p) => p.rows);
  }, [currentTab, spotlightQuery.data, active.data]);

  const onEndReached = useCallback(() => {
    if (active.hasNextPage && !active.isFetchingNextPage)
      active.fetchNextPage();
  }, [active]);

  const closeListingMenu = useCallback(() => setListingMenu(null), []);

  // What the open tab shows: its list, a genuine empty state, or — with
  // nothing loaded for it yet — loading, offline or failed. A tab the
  // person has visited keeps its rows through a tab switch (React Query
  // serves each from cache); a just-enabled one shows a spinner rather than
  // flashing its empty state.
  const tabView = useQueryView<unknown>(active, () => rows.length === 0);

  if (!profile) {
    // The server's own answer: no such profile. Deterministic, so it is
    // shown even offline and never as "couldn't load".
    if (profileQuery.isError && isNotFoundError(profileQuery.error)) {
      return (
        <View className="flex-1 bg-background">
          {navHeader}
          <ScreenError message="This profile could not be found." />
        </View>
      );
    }
    if (profileView.kind === "loading") {
      return (
        <View className="flex-1 bg-background">
          {navHeader}
          <ProfileSkeleton />
        </View>
      );
    }
    return (
      <View className="flex-1 bg-background">
        {navHeader}
        {profileView.kind === "offline" || profileView.kind === "error" ? (
          <QueryUnavailable
            view={profileView}
            subject="this profile"
            onRetry={() => profileQuery.refetch()}
          />
        ) : (
          <ScreenError message="This profile could not be found." />
        )}
      </View>
    );
  }

  const isReviewsRow = currentTab === "reviews";
  const isPlaceRow =
    (currentTab === "listings" && listingKind === "places") ||
    (currentTab === "favorites" && favSub === "places");

  const header = (
    <View>
      <ProfileHeader profile={profile} isOwn={isOwn} />

      <View className="pt-3">
        <ProfileTabBar
          tabs={tabs}
          value={currentTab}
          onChange={setTab}
          listingKind={listingKind}
          listingMenuOpen={!!listingMenu}
          onOpenListingMenu={setListingMenu}
        />
      </View>

      {currentTab === "spotlights" && segments.length > 1 ? (
        <View className="px-4 pb-2 pt-3">
          <SegmentedTabs
            options={segments.map((key) => ({
              key,
              label: SEGMENT_LABEL[key],
            }))}
            value={currentSegment}
            onChange={setSegment}
          />
        </View>
      ) : null}

      {currentTab === "favorites" ? (
        <View className="px-4 pb-2 pt-3">
          <SegmentedTabs
            options={[
              { key: "events", label: "Events" },
              { key: "places", label: "Places" },
            ]}
            value={favSub}
            onChange={setFavSub}
          />
        </View>
      ) : null}

      {currentTab === "reviews" ? (
        <View className="px-4 pb-2 pt-3">
          <SegmentedTabs
            options={[
              { key: "event", label: "Event Reviews" },
              { key: "place", label: "Place Reviews" },
            ]}
            value={reviewSub}
            onChange={setReviewSub}
          />
        </View>
      ) : null}

      {currentTab === "favorites" && !session ? (
        <EmptyState
          icon="heart-outline"
          title="Sign in to see favourites"
          description="Favourites are private to each account."
        />
      ) : null}
    </View>
  );

  const empty = emptyCopy({
    tab: currentTab,
    listingKind,
    segment: currentSegment,
    favSub,
    reviewSub,
    isOwn,
  });

  return (
    <View className="flex-1 bg-background">
      {navHeader}
      <Animated.View style={contentStyle}>
        <FlatList
          className="flex-1 bg-background"
          data={rows}
          keyExtractor={(item: { id: string }, i) => item.id ?? String(i)}
          ListHeaderComponent={header}
          // The highlights row lives in this list's header; opening/closing the
          // full-screen HighlightViewer over a list that's clipping offscreen
          // subviews is what surfaced the Fabric "child already has a parent"
          // reparenting crash on Android. The list is short — turning clipping
          // off here is cheap insurance.
          removeClippedSubviews={false}
          contentContainerClassName={
            currentTab === "spotlights" ? "gap-0.5 pb-16" : "gap-3 pb-16"
          }
          renderItem={({ item }) => {
            if (currentTab === "spotlights")
              return <SpotlightTileRow tiles={(item as GridRow).tiles} />;
            if (isReviewsRow)
              return (
                <View className="px-4">
                  {/* biome-ignore lint/suspicious/noExplicitAny: row type switches per tab */}
                  <ProfileReviewRow review={item as any} />
                </View>
              );
            if (isPlaceRow)
              return (
                <View className="px-4">
                  {/* biome-ignore lint/suspicious/noExplicitAny: row type switches per tab */}
                  <PlaceCard place={item as any} />
                </View>
              );
            return (
              <View className="px-4">
                {/* biome-ignore lint/suspicious/noExplicitAny: row type switches per tab */}
                <EventCard event={item as any} />
              </View>
            );
          }}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          refreshControl={
            <Refresher
              onRefresh={() =>
                Promise.all([active.refetch(), profileQuery.refetch()])
              }
            />
          }
          ListEmptyComponent={
            currentTab === "favorites" && !session ? null : tabView.kind ===
              "empty" ? (
              <EmptyState
                icon={empty.icon}
                title={empty.title}
                description={empty.description}
                actionLabel={empty.actionLabel}
                onAction={
                  empty.actionLabel
                    ? () => router.push("/(app)/spotlight/new?kind=spotlight")
                    : undefined
                }
              />
            ) : (
              <QueryUnavailable
                view={tabView}
                subject="this tab"
                onRetry={() => active.refetch()}
                loading={<Spinner className="mt-6" />}
              />
            )
          }
          ListFooterComponent={active.isFetchingNextPage ? <Spinner /> : null}
        />
      </Animated.View>

      <ListingKindMenu
        anchor={listingMenu}
        value={listingKind}
        onClose={closeListingMenu}
        onSelect={(kind) => {
          setListingKind(kind);
          setTab("listings");
          setListingMenu(null);
        }}
      />

      <CreateActionSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="user"
        targetId={profile.user_id}
        label={profile.username ? `@${profile.username}` : "this user"}
      />
    </View>
  );
}

// An empty tab should say what fills it, not just that it is empty — second
// person on your own profile, third on someone else's.
function emptyCopy(o: {
  tab: ProfileTab;
  listingKind: ListingKind;
  segment: SpotlightSegment;
  favSub: FavSub;
  reviewSub: ReviewSub;
  isOwn: boolean;
}): {
  icon: "albums-outline" | "play-circle-outline" | "bookmark-outline";
  title: string;
  description: string;
  actionLabel?: string;
} {
  if (o.tab === "spotlights") {
    if (o.segment === "saved") {
      return {
        icon: "bookmark-outline",
        title: "No saved Spotlights",
        description:
          "Tap Save on a Spotlight to keep it here. Only you see this.",
      };
    }
    if (o.segment === "drafts") {
      return {
        icon: "play-circle-outline",
        title: "No drafts",
        description: "Spotlights you start but don't publish wait here.",
      };
    }
    return o.isOwn
      ? {
          icon: "play-circle-outline",
          title: "No Spotlights yet",
          description: "Short videos you publish show up here.",
          actionLabel: "Create a Spotlight",
        }
      : {
          icon: "play-circle-outline",
          title: "No Spotlights yet",
          description: "Nothing published here yet.",
        };
  }
  const title =
    o.tab === "listings"
      ? o.listingKind === "events"
        ? "No events yet"
        : "No places yet"
      : o.tab === "favorites"
        ? `No favourite ${o.favSub} yet`
        : o.reviewSub === "event"
          ? "No reviews yet"
          : "No place reviews yet";
  const description = o.isOwn
    ? o.tab === "listings"
      ? `${o.listingKind === "events" ? "Events" : "Places"} you publish will be listed here.`
      : o.tab === "favorites"
        ? `Tap the heart on any ${o.favSub === "events" ? "event" : "place"} to save it here.`
        : "Reviews you leave will be listed here."
    : "Nothing here yet.";
  return { icon: "albums-outline", title, description };
}
