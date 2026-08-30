"use client";

import InfiniteList from "@/components/organisms/InfiniteList";
import type { PaginatedResult } from "@abonten/types/pagination";
import type { PlaceType } from "@abonten/types/placeType";
import PlaceCard from "../molecules/PlaceCard";
import PlaceCardSkeleton from "../molecules/PlaceCardSkeleton";

// Places-domain specialization of the shared InfiniteList, mirroring
// src/app/(pages)/events/location/[location]/AllEventsList.tsx's shape for
// the Places tab's "All Places" grid.
export default function AllPlacesList({
  queryKey,
  initialPage,
  fetchPage,
  emptyState,
}: {
  queryKey: unknown[];
  initialPage: PaginatedResult<PlaceType>;
  fetchPage: (cursor: string | null) => Promise<PaginatedResult<PlaceType>>;
  emptyState: React.ReactNode;
}) {
  return (
    <InfiniteList<PlaceType>
      queryKey={queryKey}
      initialPage={initialPage}
      fetchPage={fetchPage}
      emptyState={emptyState}
      listClassName="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-3 gap-y-4"
      loadingSkeleton={
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-3 gap-y-4">
          {Array.from({ length: 6 }, (_, i) => (
            <PlaceCardSkeleton key={i.toLocaleString()} />
          ))}
        </ul>
      }
      renderItem={(place, index) => (
        <PlaceCard key={place.id} priority={index < 4} {...place} />
      )}
    />
  );
}
