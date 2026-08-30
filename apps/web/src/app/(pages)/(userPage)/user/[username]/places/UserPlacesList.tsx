"use client";

import InfiniteList from "@/components/organisms/InfiniteList";
import AddPlaceToFavoriteButton from "@/places/molecules/AddPlaceToFavoriteButton";
import PlaceCardSkeleton from "@/places/molecules/PlaceCardSkeleton";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import type { PaginatedResult } from "@abonten/types/pagination";
import Image from "next/image";
import Link from "next/link";
import { IoLocationOutline } from "react-icons/io5";

// getOrganizerPlaces.ts returns `any` (see its own biome-ignore comment) --
// this is the shape it actually joins: the place row plus
// place_category(name, slug). It's missing the avg_rating/review_count/
// is_open fields PlaceType/PlaceCard expect -- those are only computed
// inside the get_nearby_places/get_filtered_places RPCs, not a plain
// `place` select (see PlaceType's own comment). So this list can't reuse
// PlaceCard as-is (it would have to fabricate a rating/open-status that
// isn't real); it mirrors PlaceCard's visual language instead, showing only
// what this action actually returns -- the same workaround
// OrganizerPlacesList.tsx already uses for the manage/places list fed by
// this same action.
// biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
type OwnedPlaceRow = any;

export default function UserPlacesList({
  queryKey,
  initialPage,
  fetchPage,
  emptyState,
}: {
  queryKey: unknown[];
  initialPage: PaginatedResult<OwnedPlaceRow>;
  fetchPage: (cursor: string | null) => Promise<PaginatedResult<OwnedPlaceRow>>;
  emptyState: React.ReactNode;
}) {
  return (
    <InfiniteList<OwnedPlaceRow>
      queryKey={queryKey}
      initialPage={initialPage}
      fetchPage={fetchPage}
      emptyState={emptyState}
      listClassName="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2"
      loadingSkeleton={
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <PlaceCardSkeleton key={i.toLocaleString()} />
          ))}
        </ul>
      }
      renderItem={(place, index) => {
        const fullAddress =
          (place.address as { full_address?: string })?.full_address ??
          "Location not specified";

        return (
          <li
            key={place.id}
            className="relative group overflow-hidden rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 bg-card border border-border hover:border-primary/40"
          >
            <Link
              href={`/places/${place.slug}`}
              className="block relative h-64 w-full overflow-hidden"
            >
              <Image
                src={buildCloudinaryUrl(
                  place.cover_public_id,
                  place.cover_version,
                  { width: 420, height: 256 },
                )}
                alt={`Cover photo for ${place.name}`}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                priority={index < 4}
              />

              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </Link>

            <div className="p-5 space-y-3">
              <div className="flex justify-between items-start gap-3">
                <Link
                  href={`/places/${place.slug}`}
                  className="text-lg font-medium text-card-foreground hover:text-primary transition-colors line-clamp-2"
                  title={place.name}
                >
                  {place.name}
                </Link>

                <AddPlaceToFavoriteButton placeId={place.id} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 bg-muted text-muted-foreground rounded-full text-xs">
                  {place.place_category?.name ?? "Uncategorized"}
                </span>

                {place.temporary_status && (
                  <span className="px-2.5 py-1 bg-destructive/10 text-destructive rounded-full text-xs">
                    {place.temporary_status === "permanently_closed"
                      ? "Permanently closed"
                      : "Temporarily closed"}
                  </span>
                )}
              </div>

              <div className="flex items-start gap-2 text-foreground">
                <IoLocationOutline className="mt-0.5 flex-shrink-0 text-lg text-muted-foreground" />
                <p className="text-sm line-clamp-2">{fullAddress}</p>
              </div>
            </div>
          </li>
        );
      }}
    />
  );
}
