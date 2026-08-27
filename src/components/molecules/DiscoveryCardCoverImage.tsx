import { SHIMMER_BLUR_DATA_URL } from "@/utils/imagePlaceholder";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

type DiscoveryCardCoverImageProps = {
  href: string;
  src: string;
  alt: string;
  priority?: boolean;
  /** Small badge pinned to the image's top-left corner (e.g. "You're Going"). */
  cornerBadge?: ReactNode;
  /** Full-image status overlay (e.g. "Sold Out") -- the caller is
   * responsible for its own pointer-events-none/positioning classes, since
   * only EventCard needs one today and PlaceCard doesn't. */
  centerOverlay?: ReactNode;
};

// Shared cover-image treatment for the discovery cards (EventCard,
// PlaceCard): identical Link + Image + hover-gradient markup that was
// previously hand-copied between the two domains and could silently drift
// out of sync (e.g. one getting an image-loading improvement the other
// didn't). Only the image itself and its overlays are shared here -- each
// card's metadata/content section below stays domain-specific.
export default function DiscoveryCardCoverImage({
  href,
  src,
  alt,
  priority,
  cornerBadge,
  centerOverlay,
}: DiscoveryCardCoverImageProps) {
  return (
    <Link href={href} className="block relative h-64 w-full overflow-hidden">
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover transition-transform duration-500 group-hover:scale-105"
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        priority={priority}
        placeholder="blur"
        blurDataURL={SHIMMER_BLUR_DATA_URL}
      />

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {cornerBadge && (
        <div className="absolute left-3 top-3 z-20">{cornerBadge}</div>
      )}

      {centerOverlay}
    </Link>
  );
}
