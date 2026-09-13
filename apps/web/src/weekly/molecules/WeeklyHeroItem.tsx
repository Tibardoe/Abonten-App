import { cn } from "@/components/lib/utils";
import VerifiedBadge from "@/places/molecules/VerifiedBadge";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { getEventCardDateTime } from "@abonten/core/dateFormatter";
import { getEventStatusOverlay } from "@abonten/core/getEventStatusOverlay";
import type { WeeklyItem } from "@abonten/types/weeklyType";
import Link from "next/link";
import { FiArrowRight, FiCalendar, FiMapPin, FiStar } from "react-icons/fi";
import WeeklyCoverImage from "../atoms/WeeklyCoverImage";

// The listing a "hero" section gives the most room: its own photo fills the
// card and the text sits over it, like the banners at the top of the page.
// Everything comes from the live listing; the editor only adds the headline
// and note. The whole card is one link.
export default function WeeklyHeroItem({
  item,
  priority = false,
  size = "large",
}: {
  item: WeeklyItem;
  priority?: boolean;
  /** "large" for a section's only hero, "medium" when heroes share a row. */
  size?: "large" | "medium";
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
    ? getEventCardDateTime(event.starts_at, event.ends_at, event.occurrences)
    : null;
  const overlay = event
    ? event.status === "canceled"
      ? "Event cancelled"
      : getEventStatusOverlay(event.starts_at, event.ends_at, event.occurrences)
    : place?.temporary_status === "temporarily_closed"
      ? "Temporarily closed"
      : null;
  const price = event
    ? event.min_price === 0 || event.min_price == null
      ? "Free entry"
      : `From ${event.currency ?? "GHS"} ${Number(event.min_price).toLocaleString()}`
    : null;
  const rating =
    place?.avg_rating != null && Number(place.avg_rating) > 0
      ? `${Number(place.avg_rating).toFixed(1)} (${place.review_count} review${place.review_count === 1 ? "" : "s"})`
      : null;

  return (
    <article
      className={cn(
        "group relative isolate flex overflow-hidden rounded-3xl bg-slate-950 text-white shadow-lg shadow-black/10 ring-1 ring-black/5 dark:ring-white/10",
        size === "large"
          ? "min-h-[440px] md:min-h-[460px] lg:min-h-[500px]"
          : "min-h-[420px] lg:min-h-[440px]",
      )}
    >
      <div aria-hidden className="absolute inset-0 -z-10">
        {imageId ? (
          <WeeklyCoverImage
            fallback={<HeroBrandBackdrop />}
            src={buildCloudinaryUrl(imageId, imageVersion, { width: 1100 })}
            alt=""
            fill
            priority={priority}
            quality={90}
            sizes={
              size === "large"
                ? "(max-width: 768px) 100vw, 1200px"
                : "(max-width: 768px) 100vw, 50vw"
            }
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <HeroBrandBackdrop />
        )}
        <div
          className={cn(
            "absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/10",
            size === "large" &&
              "md:bg-gradient-to-r md:from-black/85 md:via-black/45 md:to-transparent",
          )}
        />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
      </div>

      <Link
        href={href}
        className="absolute inset-0 z-10 rounded-3xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <span className="sr-only">
          {event ? "View event" : "View place"}: {title}
        </span>
      </Link>

      <div className="pointer-events-none relative z-20 flex w-full flex-col justify-between gap-6 p-5 sm:p-7 md:p-9">
        <div className="flex flex-wrap items-center gap-2">
          {item.headline ? (
            <span className="rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-primary-foreground shadow-sm">
              {item.headline}
            </span>
          ) : null}
          {overlay ? (
            <span className="rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-medium text-white ring-1 ring-white/15 backdrop-blur-md">
              {overlay}
            </span>
          ) : null}
        </div>

        <div className={cn(size === "large" ? "max-w-2xl" : "max-w-xl")}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
            {event ? (event.event_category ?? "Event") : place?.category_name}
          </p>
          <h3
            className={cn(
              "mt-1.5 text-balance font-extrabold leading-[1.05] tracking-tight drop-shadow-sm",
              size === "large"
                ? "text-3xl sm:text-4xl lg:text-5xl"
                : "text-2xl sm:text-3xl",
            )}
          >
            {title}
            {place?.verified ? (
              <span className="ml-2 inline-block align-middle">
                <VerifiedBadge />
              </span>
            ) : null}
          </h3>

          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-white/85">
            {when ? (
              <li className="flex items-center gap-1.5">
                <FiCalendar aria-hidden className="h-4 w-4 shrink-0" />
                <span>
                  {[when.date, when.time].filter(Boolean).join(" · ")}
                  {when.extraDates > 0 ? ` +${when.extraDates} more` : ""}
                </span>
              </li>
            ) : null}
            {rating ? (
              <li className="flex items-center gap-1.5">
                <FiStar
                  aria-hidden
                  className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400"
                />
                <span>{rating}</span>
              </li>
            ) : null}
            {address ? (
              <li className="flex min-w-0 items-center gap-1.5">
                <FiMapPin aria-hidden className="h-4 w-4 shrink-0" />
                <span className="line-clamp-1">{address}</span>
              </li>
            ) : null}
          </ul>

          {item.blurb ? (
            <p className="mt-3 line-clamp-3 max-w-xl whitespace-pre-line text-sm leading-relaxed text-white/85 md:text-base">
              {item.blurb}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span
              aria-hidden
              className="inline-flex h-11 items-center gap-3 rounded-full bg-white pl-5 pr-1.5 text-sm font-semibold text-slate-950 shadow-lg shadow-black/20 transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
            >
              {event ? "View event" : "View place"}
              <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-950 text-white transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none">
                <FiArrowRight className="h-4 w-4" />
              </span>
            </span>
            {price ? (
              <span className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold ring-1 ring-white/20 backdrop-blur-md">
                {price}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

// Shown when a listing has no photo or it fails to load.
function HeroBrandBackdrop() {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-primary via-teal-800 to-slate-950" />
  );
}
