"use client";

import StarRatingDisplay from "@/components/atoms/Rating";
import type { PlaceType } from "@/types/placeType";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import { derivePlaceCardOpenStatus } from "@/utils/computePlaceOpenStatus";
import Image from "next/image";
import Link from "next/link";
import { IoLocationOutline } from "react-icons/io5";
import AddPlaceToFavoriteButton from "./AddPlaceToFavoriteButton";
import PlaceOpenStatusBadge from "./PlaceOpenStatusBadge";

export default function PlaceCard({
  id,
  name,
  slug,
  category_name,
  address,
  cover_public_id,
  cover_version,
  avg_rating,
  review_count,
  distance_km,
  is_open,
  temporary_status,
  priority,
}: PlaceType & { priority?: boolean }) {
  const openStatus = derivePlaceCardOpenStatus(is_open, temporary_status);
  const fullAddress =
    (address as { full_address?: string })?.full_address ??
    "Location not specified";

  return (
    <li className="relative group overflow-hidden rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 bg-card border border-border hover:border-primary/40">
      {/* Cover Image */}
      <Link
        href={`/places/${slug}`}
        className="block relative h-64 w-full overflow-hidden"
      >
        <Image
          src={buildCloudinaryUrl(cover_public_id, cover_version, {
            width: 420,
            height: 256,
          })}
          alt={`Cover photo for ${name}`}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          priority={priority}
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </Link>

      {/* Card Content */}
      <div className="p-5 space-y-3">
        <div className="flex justify-between items-start gap-3">
          <Link
            href={`/places/${slug}`}
            className="text-lg font-medium text-card-foreground hover:text-primary transition-colors line-clamp-2"
            title={name}
          >
            {name}
          </Link>

          <AddPlaceToFavoriteButton placeId={id} />
        </div>

        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 bg-muted text-muted-foreground rounded-full text-xs">
              {category_name}
            </span>
            <PlaceOpenStatusBadge status={openStatus} />
          </div>

          <div className="flex items-start gap-2 text-foreground">
            <IoLocationOutline className="mt-0.5 flex-shrink-0 text-lg text-muted-foreground" />
            <p className="text-sm line-clamp-2">{fullAddress}</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5">
              <StarRatingDisplay rating={avg_rating ?? 0} />
              <span className="text-sm text-muted-foreground">
                ({review_count})
              </span>
            </div>

            {distance_km != null && (
              <span className="px-2 py-1 bg-muted rounded-full text-xs text-muted-foreground">
                {distance_km.toFixed(1)} km away
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
