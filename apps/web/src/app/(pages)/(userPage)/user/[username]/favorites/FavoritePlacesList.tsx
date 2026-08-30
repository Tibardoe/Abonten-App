"use client";

import InfiniteList from "@/components/organisms/InfiniteList";
import PlaceCard from "@/places/molecules/PlaceCard";
import type { FavoritePlaces } from "@/types/favoritePlaceTypes";
import type { PaginatedResult } from "@/types/pagination";

// Mirrors FavoritesList.tsx exactly (events' InfiniteList usage) for
// favorited Places instead. getUserFavoritePlaces.ts normalizes each row's
// nested `place` to the full PlaceType shape, so PlaceCard can be reused
// as-is here (unlike UserPlacesList.tsx, which is fed by getOrganizerPlaces
// and can't -- see that file's comment).
export default function FavoritePlacesList({
  queryKey,
  initialPage,
  fetchPage,
  emptyState,
}: {
  queryKey: unknown[];
  initialPage: PaginatedResult<FavoritePlaces>;
  fetchPage: (
    cursor: string | null,
  ) => Promise<PaginatedResult<FavoritePlaces>>;
  emptyState: React.ReactNode;
}) {
  return (
    <InfiniteList<FavoritePlaces>
      queryKey={queryKey}
      initialPage={initialPage}
      fetchPage={fetchPage}
      emptyState={emptyState}
      listClassName="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-2 gap-y-5 mb-5 md:mb-0"
      renderItem={(favorite, index) => (
        <PlaceCard
          key={favorite.place.id}
          priority={index < 4}
          {...favorite.place}
        />
      )}
    />
  );
}
