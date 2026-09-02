import { useSession } from "@/auth/SessionProvider";
import { EventCard } from "@/components/EventCard";
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
  Icon,
  ScreenError,
  ScreenLoader,
  SegmentedTabs,
  Spinner,
} from "@abonten/ui-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, View } from "react-native";

type FavSub = "events" | "places";
type ReviewSub = "event" | "place";

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const navigation = useNavigation();
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

  // Header: centred @username, no notification bell. Own profile also gets
  // a "+" create menu and a Settings shortcut (item 3).
  useEffect(() => {
    navigation.setOptions({
      title: username ? `@${username}` : "Profile",
      headerTitleAlign: "center",
      headerRight: isOwn
        ? () => (
            <View className="flex-row items-center pr-1">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create"
                hitSlop={8}
                onPress={() => setCreateOpen(true)}
                className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
              >
                <Icon name="add" size={26} tone="foreground" />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Settings"
                hitSlop={8}
                onPress={() => router.push("/(app)/settings")}
                className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
              >
                <Icon name="settings-outline" size={22} tone="foreground" />
              </Pressable>
            </View>
          )
        : () => null,
    });
  }, [navigation, username, isOwn, router]);

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

  if (profileQuery.isLoading) return <ScreenLoader />;
  if (profileQuery.isError || !profile) {
    return (
      <ScreenError
        message="This profile could not be loaded."
        onRetry={() => profileQuery.refetch()}
      />
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
    <>
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
        ListEmptyComponent={
          active.isLoading ? (
            <Spinner className="mt-6" />
          ) : tab === "favorites" && !session ? null : (
            <EmptyState
              icon="albums-outline"
              title={active.isError ? "Couldn't load" : emptyTitle}
            />
          )
        }
        ListFooterComponent={active.isFetchingNextPage ? <Spinner /> : null}
      />

      <CreateActionSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </>
  );
}
