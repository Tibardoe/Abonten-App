"use client";

import { recordShowcaseTap } from "@/actions/showcase/recordShowcaseTap";
import { cn } from "@/components/lib/utils";
import FollowButton from "@/spotlight/molecules/FollowButton";
import { actionUnreachable } from "@/utils/actionUnreachable";
import VerifiedBadgePopover from "@/verification/molecules/VerifiedBadgePopover";
import { placeCategoryLabel } from "@abonten/core/categoryLabels";
import {
  DEFAULT_AVATAR,
  buildCloudinaryUrl,
} from "@abonten/core/cloudinaryUrl";
import { getEventCardDateTime } from "@abonten/core/dateFormatter";
import { placePath, profilePath } from "@abonten/core/seo/paths";
import { showcaseNextUp } from "@abonten/core/showcase/rules";
import type { ShowcaseTile as Tile } from "@abonten/types/showcaseType";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";

// One host or place on the "On Abonten" wall: their picture and name (with
// the Verified mark when they have it), what is next ("Fri, 4 Dec ·
// Afro-house night", or for a place "Open now" / its kind and area), a dot
// when something of theirs is on today or this weekend, and Follow.
// Tapping the picture or the name opens their page; the tap is counted.
export default function ShowcaseTile({
  tile,
  now,
  className,
}: {
  tile: Tile;
  /** One clock for the whole wall, so every tile agrees about "today". */
  now: Date;
  className?: string;
}) {
  const t = useTranslations("showcase");
  const tc = useTranslations("core");
  const locale = useLocale();

  const href =
    tile.kind === "host"
      ? profilePath(tile.username ?? "")
      : placePath(tile.slug);
  const image =
    tile.imagePublicId != null
      ? buildCloudinaryUrl(tile.imagePublicId, tile.imageVersion, {
          width: 64,
          height: 64,
        })
      : buildCloudinaryUrl(DEFAULT_AVATAR.publicId, DEFAULT_AVATAR.version, {
          width: 64,
          height: 64,
        });

  const next = showcaseNextUp(tile, now);
  let line: string | null = null;
  if (next?.kind === "event") {
    line = next.onNow
      ? t("onNow", { title: next.title })
      : t("nextUp", {
          date: getEventCardDateTime(
            next.startsAt,
            next.endsAt,
            null,
            next.timezone,
            locale,
          ).date,
          title: next.title,
        });
  } else if (next?.kind === "open_now") {
    line = t("openNow");
  } else if (next?.kind === "place_info") {
    const category =
      next.categorySlug || next.categoryName
        ? placeCategoryLabel(tc, {
            slug: next.categorySlug,
            name: next.categoryName,
          })
        : "";
    if (category && next.area) {
      line = t("categoryInArea", { category, area: next.area });
    } else {
      line = category || next.area;
    }
  }
  const soon = next?.kind === "event" && next.soon;

  const countTap = () => {
    void recordShowcaseTap({ entryId: tile.entryId }).catch(actionUnreachable);
  };

  return (
    <div
      className={cn(
        "flex w-60 shrink-0 flex-col gap-3 rounded-2xl border border-border bg-card p-3 text-card-foreground shadow-sm",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <Link
          href={href}
          onClick={countTap}
          tabIndex={-1}
          aria-hidden
          className={cn(
            "relative h-14 w-14 shrink-0 bg-muted",
            tile.kind === "host" ? "rounded-full" : "rounded-xl",
          )}
        >
          <Image
            src={image}
            alt=""
            fill
            sizes="56px"
            className={cn(
              "object-cover",
              tile.kind === "host" ? "rounded-full" : "rounded-xl",
            )}
          />
          {soon ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-card bg-primary" />
            </span>
          ) : null}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <Link
              href={href}
              onClick={countTap}
              className="truncate font-semibold hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              {tile.name}
            </Link>
            {tile.verified ? (
              <VerifiedBadgePopover
                subjectType={tile.kind === "host" ? "organizer" : "place"}
                team={tile.kind === "host" && tile.isTeam}
                compact
                className="shrink-0"
              />
            ) : null}
          </div>
          {line ? (
            <p className="truncate text-xs text-muted-foreground">
              {soon ? (
                <>
                  <span className="sr-only">{t("soonLine", { line })}</span>
                  <span aria-hidden>{line}</span>
                </>
              ) : (
                line
              )}
            </p>
          ) : null}
        </div>
      </div>
      <FollowButton
        kind={tile.kind === "host" ? "organizer" : "place"}
        targetId={tile.subjectId}
        ownerId={tile.kind === "host" ? tile.subjectId : tile.ownerId}
        label={tile.name}
        known={tile.following}
        showcaseEntryId={tile.entryId}
        className="justify-center"
      />
    </div>
  );
}
