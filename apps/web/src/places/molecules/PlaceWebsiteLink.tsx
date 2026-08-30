"use client";

import { logPlaceEngagement } from "@/actions/logPlaceEngagement";
import { FiArrowUpRight } from "react-icons/fi";

type PlaceWebsiteLinkProps = {
  placeId: string;
  websiteUrl: string;
  className?: string;
};

export default function PlaceWebsiteLink({
  placeId,
  websiteUrl,
  className,
}: PlaceWebsiteLinkProps) {
  const href = /^https?:\/\//i.test(websiteUrl)
    ? websiteUrl
    : `https://${websiteUrl}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => logPlaceEngagement(placeId, "website_click")}
      className={
        className ??
        "flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-lg hover:bg-primary/90 transition-colors"
      }
    >
      Visit Website <FiArrowUpRight />
    </a>
  );
}
