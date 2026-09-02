import { useSession } from "@/auth/SessionProvider";
import { EventCard } from "@/components/EventCard";
import { AppHeader, HeaderIconButton } from "@/components/app/AppHeader";
import { CreateActionSheet } from "@/components/profile/CreateActionSheet";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import {
  ProfilePlaceRow,
  ProfileReviewRow,
} from "@/components/profile/ProfileRows";
import {
  ProfileTabBar,
  type ProfileTabKey,
} from "@/components/profile/ProfileTabBar";
import {
  useProfileEvents,
  useProfileFavoriteEvents,
  useProfileFavoritePlaces,
  useProfilePlaceReviews,
  useProfilePlaces,
  useProfileReviews,
} from "@/features/profile/useProfileTabs";
import { usePublicProfile } from "@/features/profile/usePublicProfile";
import {
  EmptyState,
  ScreenError,
  ScreenLoader,
  SegmentedTabs,
  Spinner,
} from "@abonten/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";

type FavSub = "events" | "places";
type ReviewSub = "event" | "place";

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const { session } = useSession();

  const profileQuery = usePublicProfile(username);
  const profile = profileQuery.data;
  const isOwn = !!session && session.user.id === profile?.user_id;

  const [tab, setTab] = useState<ProfileTabKey>("events");
  const [favSub, setFavSub] = useState<FavSub>("events");
  const [reviewSub, setReviewSub] = useState<ReviewSub>("event");
  const [createOpen, setCreateOpen] = useState(false);

  const tabs = useMemo<ProfileTabKey[]>(
    () =>
      isOwn
        ? ["events", "places", "favorites", "reviews"]
        : ["events", "places", "reviews"],
    [isOwn],
  );

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
        ) : undefined
      }
    />
  );

  const events = useProfileEvents(profile?.user_id);
  const places = useProfilePlaces(profile?.user_id);
  const favEvents = useProfileFavoriteEvents(
    tab === "favorites" && favSub === "events",
  );
  const favPlaces = useProfileFavoritePlaces(
    tab === "favorites" && favSub === "places",
  );
  const reviews = useProfileReviews(profile?.user_id);
  const placeReviews = useProfilePlaceReviews(profile?.user_id);

  const active =
    tab === "events"
      ? events
      : tab === "places"
        ? places
        : tab === "reviews"
          ? reviewSub === "event"
            ? reviews
            : placeReviews
          : favSub === "events"
            ? favEvents
            : favPlaces;

  const pages = (active.data?.pages ?? []) as { rows: { id: string }[] }[];
  const rows = pages.flatMap((p) => p.rows);

  const onEndReached = useCallback(() => {
    if (active.hasNextPage && !active.isFetchingNextPage)
      active.fetchNextPage();
  }, [active]);

  // A tab is still "loading" until its query has produced data at least
  // once — `isPending` (no data yet), not `isLoading` (which is false while
  // a switched-to / re-enabled query spins up), so a slow or just-enabled
  // tab shows a spinner rather than flashing its empty state.
  const showTabLoader = active.isPending && !active.isError;

  if (profileQuery.isLoading) {
    return (
      <View className="flex-1 bg-background">
        {navHeader}
        <ScreenLoader />
      </View>
    );
  }
  if (profileQuery.isError || !profile) {
    return (
      <View className="flex-1 bg-background">
        {navHeader}
        <ScreenError
          message="This profile could not be loaded."
          onRetry={() => profileQuery.refetch()}
        />
      </View>
    );
  }

  const isReviewsRow = tab === "reviews";
  const isPlaceRow =
    tab === "places" || (tab === "favorites" && favSub === "places");

  const header = (
    <View>
      <ProfileHeader profile={profile} isOwn={isOwn} />

      <View className="pt-3">
        <ProfileTabBar tabs={tabs} value={tab} onChange={setTab} />
      </View>

      {tab === "favorites" ? (
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

      {tab === "reviews" ? (
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

      {tab === "favorites" && !session ? (
        <EmptyState
          icon="heart-outline"
          title="Sign in to see favourites"
          description="Favourites are private to each account."
        />
      ) : null}
    </View>
  );

  const emptyTitle =
    tab === "events"
      ? "No events yet"
      : tab === "places"
        ? "No places yet"
        : tab === "favorites"
          ? `No favourite ${favSub} yet`
          : reviewSub === "event"
            ? "No reviews yet"
            : "No place reviews yet";

  return (
    <View className="flex-1 bg-background">
      {navHeader}
      <FlatList
        className="flex-1 bg-background"
        data={rows}
        keyExtractor={(item: { id: string }, i) => item.id ?? String(i)}
        ListHeaderComponent={header}
        contentContainerClassName="gap-3 pb-16"
        renderItem={({ item }) => {
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
                <ProfilePlaceRow place={item as any} />
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
          <RefreshControl
            refreshing={active.isRefetching && !active.isFetchingNextPage}
            onRefresh={() => active.refetch()}
          />
        }
        ListEmptyComponent={
          showTabLoader ? (
            <Spinner className="mt-6" />
          ) : tab === "favorites" && !session ? null : active.isError ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="Couldn't load"
              description="Pull down to try again."
            />
          ) : (
            <EmptyState icon="albums-outline" title={emptyTitle} />
          )
        }
        ListFooterComponent={active.isFetchingNextPage ? <Spinner /> : null}
      />

      <CreateActionSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </View>
  );
}
