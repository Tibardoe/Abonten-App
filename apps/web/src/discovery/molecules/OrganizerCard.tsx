"use client";

import VerifiedBadgePopover from "@/verification/molecules/VerifiedBadgePopover";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import type { SearchOrganizerHit } from "@abonten/types/searchType";
import Image from "next/image";
import Link from "next/link";
import {
  IoCalendarOutline,
  IoStar,
  IoStorefrontOutline,
} from "react-icons/io5";
import SubscribeBell from "./SubscribeBell";

const DEFAULT_AVATAR = { id: "AnonymousProfile_rn6qez", version: "1743533914" };

// One organizer in search results: who they are, whether they're verified,
// how active they are, a way into their events, and the private
// "Notify me" bell. Rendered as an <li> like EventCard and PlaceCard.
export default function OrganizerCard({
  organizer,
}: {
  organizer: SearchOrganizerHit;
}) {
  const href = `/user/${organizer.username}/posts`;
  const avatar = buildCloudinaryUrl(
    organizer.avatarPublicId ?? DEFAULT_AVATAR.id,
    organizer.avatarPublicId ? organizer.avatarVersion : DEFAULT_AVATAR.version,
    { width: 112, height: 112 },
  );
  const eventsHref = `/search?type=events&organizer=${organizer.id}&by=${encodeURIComponent(organizer.username)}`;

  return (
    <li className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40">
      <div className="flex items-start gap-3">
        <Link
          href={href}
          className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-muted"
        >
          <Image
            src={avatar}
            alt=""
            fill
            sizes="56px"
            className="object-cover"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Link
              href={href}
              className="truncate font-medium text-card-foreground hover:text-primary"
            >
              {organizer.fullName || `@${organizer.username}`}
            </Link>
            {organizer.verified ? (
              <VerifiedBadgePopover subjectType="organizer" compact />
            ) : null}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            @{organizer.username}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {organizer.upcomingCount > 0 ? (
              <span className="inline-flex items-center gap-1">
                <IoCalendarOutline aria-hidden />
                {organizer.upcomingCount} upcoming
              </span>
            ) : null}
            {organizer.placeCount > 0 ? (
              <span className="inline-flex items-center gap-1">
                <IoStorefrontOutline aria-hidden />
                {organizer.placeCount}{" "}
                {organizer.placeCount === 1 ? "place" : "places"}
              </span>
            ) : null}
            {organizer.ratingCount > 0 && organizer.avgRating != null ? (
              <span className="inline-flex items-center gap-1">
                <IoStar aria-hidden className="text-primary" />
                {organizer.avgRating.toFixed(1)} ({organizer.ratingCount})
              </span>
            ) : null}
            {organizer.isNew ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                New
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {organizer.bio ? (
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {organizer.bio}
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {organizer.upcomingCount > 0 ? (
          <Link
            href={eventsHref}
            className="inline-flex items-center rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            See their events
          </Link>
        ) : null}
        <SubscribeBell
          kind="organizer"
          targetId={organizer.id}
          ownerId={organizer.id}
          label={`@${organizer.username}`}
        />
      </div>
    </li>
  );
}
