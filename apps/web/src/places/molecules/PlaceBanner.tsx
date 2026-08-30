"use client";

import StarRatingDisplay from "@/components/atoms/Rating";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import type { PlaceType } from "@abonten/types/placeType";
import Image from "next/image";
import Link from "next/link";
import { FaArrowRightLong } from "react-icons/fa6";
import { IoLocationOutline } from "react-icons/io5";
import SponsoredBadge from "./SponsoredBadge";

type PlaceBannerProps = {
  place: PlaceType;
};

// Place counterpart to src/components/molecules/Banner.tsx (the Featured
// Events banner) -- same full-bleed hero structure and visual weight, with
// Place-appropriate content (category/location/rating) instead of
// date/time/price. Used by FeaturedPlacesSlider both for the lone-item case
// (no carousel) and as each slide's content when there are 2+ places.
export default function PlaceBanner({ place }: PlaceBannerProps) {
  const fullAddress =
    (place.address as { full_address?: string })?.full_address ??
    "Location not specified";

  return (
    <div className="group relative w-full h-[250px] md:h-[350px] rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300">
      <div className="absolute inset-0">
        <Image
          src={buildCloudinaryUrl(place.cover_public_id, place.cover_version, {
            width: 900,
            height: 350,
          })}
          alt={`Cover photo for ${place.name}`}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          priority
          quality={90}
          sizes="(max-width: 375px) 100vw, (max-width: 640px) 90vw, (max-width: 768px) 80vw, (max-width: 1024px) 70vw, 60vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900/90 via-gray-900/50 to-transparent" />
      </div>

      <div className="relative h-full flex flex-col justify-end p-3 xs:p-4 sm:p-5 md:p-6 lg:p-8 text-white">
        <div className="absolute top-2 right-2 xs:top-3 xs:right-3 sm:top-4 sm:right-4 md:top-5 md:right-5 lg:top-6 lg:right-6">
          <SponsoredBadge />
        </div>

        <div className="w-fit space-y-1 xs:space-y-1.5 sm:space-y-2 md:space-y-3 lg:space-y-4">
          <div className="mb-1 xs:mb-1.5 sm:mb-2">
            <span className="inline-block px-2 py-0.5 xs:px-2.5 xs:py-1 sm:px-3 sm:py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs xs:text-sm font-medium">
              {place.category_name}
            </span>
          </div>

          <Link
            href={`/places/${place.slug}`}
            className="block mb-2 xs:mb-3 sm:mb-4"
          >
            <h2 className="text-lg xs:text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold leading-tight">
              {place.name}
            </h2>
          </Link>

          <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4 text-xs md:text-base">
            <div className="flex items-center gap-1 xs:gap-2">
              <IoLocationOutline className="flex-shrink-0 text-xs xs:text-sm" />
              <span className="truncate">{fullAddress}</span>
            </div>

            {place.review_count > 0 && (
              <div className="flex items-center gap-1 xs:gap-2">
                <StarRatingDisplay rating={place.avg_rating ?? 0} />
                <span>({place.review_count})</span>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center">
            <Link
              href={`/places/${place.slug}`}
              className="px-3 py-1.5 md:px-4 md:py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md transition-colors flex items-center gap-1 xs:gap-2 text-xs md:text-sm"
            >
              View Place
              <FaArrowRightLong />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
