import StarRatingDisplay from "@/components/atoms/Rating";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { getRelativeTime } from "@abonten/core/dateFormatter";
import Image from "next/image";
import type { ReactNode } from "react";
import ReviewPhotoGrid from "./ReviewPhotoGrid";

type ReviewPhoto = {
  id: string;
  public_id: string;
  version: string;
  position: number;
};

type ReviewListItemProps = {
  avatarPublicId?: string | null;
  avatarVersion?: string | null;
  username?: string | null;
  createdAt: string;
  rating: number;
  title?: string | null;
  comment?: string | null;
  isVerifiedAttendee?: boolean;
  photos?: ReviewPhoto[] | null;
  responseLabel?: string;
  responseText?: string | null;
  // Event-only inline reply affordance (organizer's "Reply" button/composer).
  // Places don't compose a response from this page, so this is simply
  // omitted there.
  children?: ReactNode;
};

// Shared review row -- avatar, name, timestamp, rating, verified badge,
// title/comment, photo grid, and an existing response -- previously
// duplicated almost verbatim between EventReviewsSection and
// PlaceReviewsSection. The two organisms still own their own InfiniteList
// wiring and (for events) the reply-composer logic; this only unifies the
// per-review markup.
export default function ReviewListItem({
  avatarPublicId,
  avatarVersion,
  username,
  createdAt,
  rating,
  title,
  comment,
  isVerifiedAttendee,
  photos,
  responseLabel,
  responseText,
  children,
}: ReviewListItemProps) {
  return (
    <li className="border-b border-border pb-6 last:border-0 last:pb-0">
      <div className="flex items-center gap-3">
        {avatarPublicId ? (
          <Image
            src={buildCloudinaryUrl(avatarPublicId, avatarVersion, {
              width: 40,
              height: 40,
            })}
            alt={username ?? "Reviewer"}
            width={40}
            height={40}
            className="rounded-full border border-border"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-muted" />
        )}

        <div className="flex-1 min-w-0">
          <p className="font-medium text-card-foreground truncate">
            {username ?? "Anonymous"}
          </p>
          <p className="text-xs text-muted-foreground">
            {getRelativeTime(createdAt)}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1">
          <StarRatingDisplay rating={rating} />
          {isVerifiedAttendee && (
            <span className="text-[11px] font-medium text-success whitespace-nowrap">
              ✓ Verified Attendee
            </span>
          )}
        </div>
      </div>

      {title && (
        <h4 className="font-medium text-card-foreground mt-2">{title}</h4>
      )}

      {comment && (
        <p className="text-muted-foreground text-sm mt-1 leading-relaxed">
          {comment}
        </p>
      )}

      <ReviewPhotoGrid photos={photos} />

      {responseText && (
        <div className="mt-3 ml-4 md:ml-8 p-3 rounded-lg bg-muted border-l-4 border-primary">
          <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">
            {responseLabel}
          </p>
          <p className="text-sm text-foreground">{responseText}</p>
        </div>
      )}

      {children}
    </li>
  );
}
