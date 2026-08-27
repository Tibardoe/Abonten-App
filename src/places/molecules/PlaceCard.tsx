"use client";

import StarRatingDisplay from "@/components/atoms/Rating";
import DiscoveryCardCoverImage from "@/components/molecules/DiscoveryCardCoverImage";
import DiscoveryCardTitleRow from "@/components/molecules/DiscoveryCardTitleRow";
import type { PlaceType } from "@/types/placeType";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import { derivePlaceCardOpenStatus } from "@/utils/computePlaceOpenStatus";
import { IoLocationOutline } from "react-icons/io5";
import AddPlaceToFavoriteButton from "./AddPlaceToFavoriteButton";
import PlaceOpenStatusBadge from "./PlaceOpenStatusBadge";
import VerifiedBadge from "./VerifiedBadge";

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
  verified,
  priority,
}: PlaceType & { priority?: boolean }) {
  const openStatus = derivePlaceCardOpenStatus(is_open, temporary_status);
  const fullAddress =
    (address as { full_address?: string })?.full_address ??
    "Location not specified";
  const placeHref = `/places/${slug}`;

  return (
    <li className="relative group overflow-hidden rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 bg-card border border-border hover:border-primary/40">
      <DiscoveryCardCoverImage
        href={placeHref}
        src={buildCloudinaryUrl(cover_public_id, cover_version, {
          width: 420,
          height: 256,
        })}
        alt={`Cover photo for ${name}`}
        priority={priority}
      />

      {/* Card Content */}
      <div className="p-5 space-y-3">
        <DiscoveryCardTitleRow
          href={placeHref}
          title={name}
          action={<AddPlaceToFavoriteButton placeId={id} />}
        />

        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 bg-muted text-muted-foreground rounded-full text-xs">
              {category_name}
            </span>
            {verified && <VerifiedBadge />}
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
