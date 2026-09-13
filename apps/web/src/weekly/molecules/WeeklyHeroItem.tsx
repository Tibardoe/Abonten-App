import VerifiedBadge from "@/places/molecules/VerifiedBadge";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { getFormattedEventDate } from "@abonten/core/dateFormatter";
import { getEventStatusOverlay } from "@abonten/core/getEventStatusOverlay";
import { SHIMMER_BLUR_DATA_URL } from "@abonten/core/imagePlaceholder";
import type { WeeklyItem } from "@abonten/types/weeklyType";
import Image from "next/image";
import Link from "next/link";
import { FiCalendar, FiMapPin, FiStar } from "react-icons/fi";

// The big card for a "hero" section: one listing given the most room on the
// page. Everything here comes from the live listing; the editor only adds the
// headline and note.
export default function WeeklyHeroItem({
  item,
  priority = false,
}: {
  item: WeeklyItem;
  priority?: boolean;
}) {
  const event = item.event;
  const place = item.place;
  if (!event && !place) return null;

  const href = event
    ? `/events/${event.event_code.toLowerCase()}`
    : `/places/${place?.slug}`;
  const title = event ? event.title : (place?.name ?? "");
  const imageId = event ? event.flyer_public_id : place?.cover_public_id;
  const imageVersion = event ? event.flyer_version : place?.cover_version;
  const address = (
    (event?.address ?? place?.address) as { full_address?: string } | undefined
  )?.full_address;
  const when = event
    ? getFormattedEventDate(event.starts_at, event.ends_at, event.occurrences)
    : null;
  const overlay = event
    ? event.status === "canceled"
      ? "Event cancelled"
      : getEventStatusOverlay(event.starts_at, event.ends_at, event.occurrences)
    : null;
  const price = event
    ? event.min_price === 0 || event.min_price == null
      ? "Free entry"
      : `From ${event.currency} ${event.min_price}`
    : null;

  return (
    <article className="group grid overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:grid-cols-[3fr_2fr]">
      <Link
        href={href}
        className="relative block aspect-[16/10] w-full overflow-hidden md:aspect-auto md:min-h-[320px]"
        tabIndex={-1}
        aria-hidden
      >
        {imageId ? (
          <Image
            src={buildCloudinaryUrl(imageId, imageVersion, {
              width: 960,
              height: 600,
            })}
            alt=""
            fill
            priority={priority}
            sizes="(max-width: 768px) 100vw, 60vw"
            placeholder="blur"
            blurDataURL={SHIMMER_BLUR_DATA_URL}
            className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div className="absolute inset-0 bg-muted" />
        )}
        {overlay ? (
          <span className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white">
            {overlay}
          </span>
        ) : null}
      </Link>
      <div className="flex flex-col gap-3 p-5 md:p-6">
        {item.headline ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {item.headline}
          </p>
        ) : null}
        <h3 className="text-xl font-semibold leading-tight md:text-2xl">
          <Link href={href} className="hover:text-primary hover:underline">
            {title}
          </Link>
          {place?.verified ? (
            <span className="ml-2 inline-block align-middle">
              <VerifiedBadge />
            </span>
          ) : null}
        </h3>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {when ? (
            <li className="flex items-center gap-2">
              <FiCalendar aria-hidden className="shrink-0" />
              <span>
                {when.date} · {when.time}
              </span>
            </li>
          ) : null}
          {place ? (
            <li className="flex items-center gap-2">
              <FiStar aria-hidden className="shrink-0" />
              <span>
                {place.category_name}
                {place.avg_rating
                  ? ` · ${Number(place.avg_rating).toFixed(1)} (${place.review_count} review${place.review_count === 1 ? "" : "s"})`
                  : ""}
              </span>
            </li>
          ) : null}
          {address ? (
            <li className="flex items-center gap-2">
              <FiMapPin aria-hidden className="shrink-0" />
              <span className="line-clamp-1">{address}</span>
            </li>
          ) : null}
        </ul>
        {item.blurb ? (
          <p className="whitespace-pre-line text-sm leading-relaxed">
            {item.blurb}
          </p>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
          {price ? (
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
              {price}
            </span>
          ) : null}
          <Link
            href={href}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {event ? "View event" : "View place"}
            <span className="sr-only">: {title}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
