import Link from "next/link";
import type { ReactNode } from "react";

type DiscoveryCardTitleRowProps = {
  href: string;
  title: string;
  /** Trailing action for this card -- EventCard's 3-dot menu, PlaceCard's
   * favorite button. Identical row layout, domain-specific action content. */
  action?: ReactNode;
};

// Shared title-link + trailing-action row for discovery cards (EventCard,
// PlaceCard) -- see DiscoveryCardCoverImage.tsx's comment for why this pair
// is worth sharing while the rest of each card stays domain-specific.
export default function DiscoveryCardTitleRow({
  href,
  title,
  action,
}: DiscoveryCardTitleRowProps) {
  return (
    <div className="flex justify-between items-start gap-3">
      <Link
        href={href}
        className="text-lg font-medium text-card-foreground hover:text-primary transition-colors line-clamp-2"
        title={title}
      >
        {title}
      </Link>

      {action}
    </div>
  );
}
