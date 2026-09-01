import { useSession } from "@/auth/SessionProvider";
import { EventCard } from "@/components/EventCard";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import {
  ProfilePlaceRow,
  ProfileReviewRow,
} from "@/components/profile/ProfileRows";
import {
  useProfileEvents,
  useProfileFavoriteEvents,
  useProfileFavoritePlaces,
  useProfilePlaces,
  useProfileReviews,
} from "@/features/profile/useProfileTabs";
import { usePublicProfile } from "@/features/profile/usePublicProfile";
import {
  Chip,
  EmptyState,
  ScreenError,
  ScreenLoader,
  Spinner,
} from "@abonten/ui-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, View } from "react-native";

type Tab = "events" | "places" | "favorites" | "reviews";
const TABS: { key: Tab; label: string }[] = [
  { key: "events", label: "Events" },
  { key: "places", label: "Places" },
  { key: "favorites", label: "Favorites" },
  { key: "reviews", label: "Reviews" },
];

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const navigation = useNavigation();
  const { session } = useSession();

  const profileQuery = usePublicProfile(username);
  const profile = profileQuery.data;
  const isOwn = !!session && session.user.id === profile?.user_id;

  const [tab, setTab] = useState<Tab>("events");
  const [favSub, setFavSub] = useState<"events" | "places">("events");

  useEffect(() => {
    navigation.setOptions({ title: username ? `@${username}` : "Profile" });
  }, [navigation, username]);

  const events = useProfileEvents(profile?.user_id);
  const places = useProfilePlaces(profile?.user_id);
  const favEvents = useProfileFavoriteEvents(
    tab === "favorites" && favSub === "events",
  );
  const favPlaces = useProfileFavoritePlaces(
    tab === "favorites" && favSub === "places",
  );
  const reviews = useProfileReviews(profile?.user_id);

  const active =
    tab === "events"
      ? events
      : tab === "places"
        ? places
        : tab === "reviews"
          ? reviews
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

  const header = (
    <View>
      <ProfileHeader profile={profile} isOwn={isOwn} />

      <View className="flex-row gap-2 px-4 pb-2 pt-3">
        {TABS.map((t) => (
          <Chip
            key={t.key}
            label={t.label}
            selected={tab === t.key}
            onPress={() => setTab(t.key)}
          />
        ))}
      </View>

      {tab === "favorites" ? (
        <View className="flex-row gap-2 px-4 pb-2">
          <Chip
            label="Events"
            selected={favSub === "events"}
            onPress={() => setFavSub("events")}
          />
          <Chip
            label="Places"
            selected={favSub === "places"}
            onPress={() => setFavSub("places")}
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

  const emptyLabel: Record<Tab, string> = {
    events: "No events yet",
    places: "No places yet",
    favorites: `No favourite ${favSub} yet`,
    reviews: "No reviews yet",
  };

  return (
    <FlatList
      className="flex-1 bg-background"
      data={rows}
      keyExtractor={(item: { id: string }, i) => item.id ?? String(i)}
      ListHeaderComponent={header}
      contentContainerClassName="gap-3 pb-16"
      renderItem={({ item }) => {
        if (tab === "reviews")
          return (
            <View className="px-4">
              {/* biome-ignore lint/suspicious/noExplicitAny: row type switches per tab */}
              <ProfileReviewRow review={item as any} />
            </View>
          );
        if (tab === "places" || (tab === "favorites" && favSub === "places"))
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
            title={active.isError ? "Couldn't load" : emptyLabel[tab]}
          />
        )
      }
      ListFooterComponent={active.isFetchingNextPage ? <Spinner /> : null}
    />
  );
}
