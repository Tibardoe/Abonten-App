"use client";

import { logPlaceEngagement } from "@/actions/logPlaceEngagement";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("places");

  const href = /^https?:\/\//i.test(websiteUrl)
    ? websiteUrl
    : `https://${websiteUrl}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() =>
        logPlaceEngagement(placeId, "website_click").catch(actionUnreachable)
      }
      className={
        className ??
        "flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-lg hover:bg-primary/90 transition-colors"
      }
    >
      {t("visitWebsite")} <FiArrowUpRight />
    </a>
  );
}
