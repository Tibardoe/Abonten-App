"use client";

import StarRatingDisplay from "@/components/atoms/Rating";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { getRelativeTime } from "@abonten/core/dateFormatter";
import {
  type ReviewListRow,
  type ReviewSubjectKind,
  reviewerDisplayName,
} from "@abonten/core/reviews/reviewList";
import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import ReviewPhotoGrid from "./ReviewPhotoGrid";

type ReviewListItemProps = {
  review: ReviewListRow;
  kind: ReviewSubjectKind;
  /** The viewer wrote it. */
  isOwn?: boolean;
  /** Pinned from a shared link. */
  highlighted?: boolean;
  /** Helpful button + ⋯ menu (ReviewItemActions). */
  actions?: ReactNode;
  /** The organizer's reply composer, on their own event's reviews. */
  children?: ReactNode;
};

// One public review of an event or a place — avatar, name, when (and
// whether it was edited), stars, verified-attendee badge, title, text,
// photos, the organizer's / owner's reply — on the details preview and the
// full reviews page alike. The row shape comes from review_list via
// @abonten/core/reviews/reviewList, the same one the app renders.
export default function ReviewListItem({
  review,
  kind,
  isOwn = false,
  highlighted = false,
  actions,
  children,
}: ReviewListItemProps) {
  const [expanded, setExpanded] = useState(false);
  // "Read more" only when the clamped text actually overflows — a character
  // count can't know how wide the column is.
  const commentRef = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const el = commentRef.current;
    if (!el || expanded) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded]);
  const name = reviewerDisplayName(review.reviewer, kind);
  const profileHref =
    !review.reviewer.deleted && review.reviewer.username
      ? `/user/${review.reviewer.username}/posts`
      : null;
  const avatar = review.reviewer.avatarPublicId ? (
    <Image
      src={buildCloudinaryUrl(
        review.reviewer.avatarPublicId,
        review.reviewer.avatarVersion,
        { width: 40, height: 40 },
      )}
      alt=""
      width={40}
      height={40}
      className="rounded-full border border-border"
    />
  ) : (
    <div className="w-10 h-10 rounded-full bg-muted" />
  );

  return (
    <li
      id={`review-${review.id}`}
      className={
        highlighted
          ? "rounded-xl border-2 border-primary p-4 scroll-mt-24"
          : "border-b border-border pb-6 last:border-0 last:pb-0 scroll-mt-24"
      }
    >
      {highlighted ? (
        <p className="mb-2 text-xs font-semibold text-primary">Shared review</p>
      ) : null}
      <div className="flex items-center gap-3">
        {profileHref ? (
          <Link href={profileHref} aria-label={`${name}'s profile`}>
            {avatar}
          </Link>
        ) : (
          avatar
        )}

        <div className="flex-1 min-w-0">
          <p className="font-medium text-card-foreground truncate">
            {profileHref ? (
              <Link href={profileHref} className="hover:underline">
                {name}
              </Link>
            ) : (
              name
            )}
            {isOwn ? (
              <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-primary">
                You
              </span>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">
            {getRelativeTime(review.createdAt)}
            {review.editedAt ? " · Edited" : ""}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1">
          <StarRatingDisplay rating={review.rating} />
          {kind === "event" && review.isVerifiedAttendee ? (
            <span className="text-[11px] font-medium text-success whitespace-nowrap">
              ✓ Verified attendee
            </span>
          ) : null}
        </div>
      </div>

      {review.title ? (
        <h4 className="font-medium text-card-foreground mt-2">
          {review.title}
        </h4>
      ) : null}

      {review.comment ? (
        <div className="mt-1">
          <p
            ref={commentRef}
            className={`text-muted-foreground text-sm leading-relaxed whitespace-pre-line ${
              expanded ? "" : "line-clamp-5"
            }`}
          >
            {review.comment}
          </p>
          {overflows || expanded ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-sm font-medium text-primary hover:underline"
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          ) : null}
        </div>
      ) : null}

      <ReviewPhotoGrid photos={review.photos} />

      {review.response ? (
        <div className="mt-3 ml-4 md:ml-8 p-3 rounded-lg bg-muted border-l-4 border-primary">
          <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">
            {kind === "event" ? "Organizer's reply" : "Owner's reply"}
          </p>
          <p className="text-sm text-foreground">{review.response}</p>
        </div>
      ) : null}

      {actions ? <div className="mt-3">{actions}</div> : null}

      {children}
    </li>
  );
}
