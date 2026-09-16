"use client";

import { cn } from "@/components/lib/utils";
import { contentCtaLabel } from "@abonten/core/content/copy";
import type { ContentPostDocument } from "@abonten/types/contentType";
import Link from "next/link";
import { IoChevronForward } from "react-icons/io5";
import { trackContentClick } from "../hooks/useContentTelemetry";
import { publisherHref } from "../lib/publisher";

// The call to action under a post. Its wording comes from the live state of
// the attached event or place, so an ended or cancelled event never shows a
// "View event" button.
export default function ContentCtaButton({
  post,
  campaignId,
  className,
}: {
  post: ContentPostDocument;
  campaignId?: string | null;
  className?: string;
}) {
  const cta = contentCtaLabel(post);
  if (!cta.label) return null;

  let href: string | null = null;
  if (cta.target === "event" && post.event) {
    href = `/events/${post.event.eventCode.toLowerCase()}`;
  } else if (cta.target === "place") {
    href = post.place
      ? `/places/${post.place.slug}`
      : publisherHref(post.publisher);
  } else if (cta.target === "profile") {
    href = publisherHref(post.publisher);
  }

  const classes = cn(
    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold",
    href
      ? "bg-white/95 text-black hover:bg-white"
      : "cursor-default bg-black/40 text-white/80",
    className,
  );

  if (!href || !cta.target) {
    return <span className={classes}>{cta.label}</span>;
  }

  return (
    <Link
      href={href}
      className={classes}
      onClick={() =>
        trackContentClick(post.id, cta.target ?? "cta", campaignId)
      }
    >
      {cta.label}
      <IoChevronForward aria-hidden />
    </Link>
  );
}
