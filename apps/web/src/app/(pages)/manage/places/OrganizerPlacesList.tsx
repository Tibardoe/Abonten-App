"use client";

import InfiniteList from "@/components/organisms/InfiniteList";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import type { PaginatedResult } from "@abonten/types/pagination";
import Image from "next/image";
import Link from "next/link";
import { FaChevronRight } from "react-icons/fa";

// getOrganizerPlaces.ts returns `any` (see its own biome-ignore comment) --
// this is the shape it actually joins: the place row plus place_category(name, slug).
// biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
type OrganizerPlaceRow = any;

export default function OrganizerPlacesList({
  queryKey,
  initialPage,
  fetchPage,
  emptyState,
}: {
  queryKey: unknown[];
  initialPage: PaginatedResult<OrganizerPlaceRow>;
  fetchPage: (
    cursor: string | null,
  ) => Promise<PaginatedResult<OrganizerPlaceRow>>;
  emptyState: React.ReactNode;
}) {
  return (
    <InfiniteList<OrganizerPlaceRow>
      queryKey={queryKey}
      initialPage={initialPage}
      fetchPage={fetchPage}
      emptyState={emptyState}
      listClassName="flex flex-col gap-2 mb-5"
      renderItem={(place) => (
        <li
          key={place.id}
          className="border border-border bg-card text-card-foreground rounded-md shadow-md p-4"
        >
          <Link
            href={`/manage/places/${place.id}`}
            className="flex items-center gap-3"
          >
            <div className="relative w-14 h-14 shrink-0 rounded-md overflow-hidden bg-muted">
              <Image
                src={buildCloudinaryUrl(
                  place.cover_public_id,
                  place.cover_version,
                  { width: 112, height: 112 },
                )}
                alt={place.name}
                fill
                className="object-cover"
              />
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="font-bold truncate">{place.name}</h2>
              <p className="text-sm text-muted-foreground truncate">
                {place.place_category?.name ?? "Uncategorized"}
                {place.temporary_status && (
                  <span className="ml-2 text-destructive">
                    ·{" "}
                    {place.temporary_status === "permanently_closed"
                      ? "Permanently closed"
                      : "Temporarily closed"}
                  </span>
                )}
              </p>
            </div>

            <FaChevronRight className="shrink-0 md:text-xl" />
          </Link>
        </li>
      )}
    />
  );
}
