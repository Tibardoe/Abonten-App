import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { getFormattedEventDate } from "@abonten/core/dateFormatter";
import type { WeeklyItem } from "@abonten/types/weeklyType";
import Image from "next/image";
import Link from "next/link";

// A compact row for "list" sections: thumbnail, headline, title and one line
// of detail. Good for longer runs of picks where full cards would be heavy.
export default function WeeklyListItem({ item }: { item: WeeklyItem }) {
  const event = item.event;
  const place = item.place;
  if (!event && !place) return null;

  const href = event
    ? `/events/${event.event_code.toLowerCase()}`
    : `/places/${place?.slug}`;
  const title = event ? event.title : (place?.name ?? "");
  const imageId = event ? event.flyer_public_id : place?.cover_public_id;
  const imageVersion = event ? event.flyer_version : place?.cover_version;
  const detail = event
    ? [
        getFormattedEventDate(
          event.starts_at,
          event.ends_at,
          event.occurrences,
          event.timezone,
        ).date,
        event.address?.full_address,
      ]
    : [
        place?.category_name,
        (place?.address as { full_address?: string } | undefined)?.full_address,
      ];

  return (
    <li className="flex gap-4 rounded-xl border border-border bg-card p-3 md:p-4">
      <Link
        href={href}
        tabIndex={-1}
        aria-hidden
        className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted md:h-24 md:w-24"
      >
        {imageId ? (
          <Image
            src={buildCloudinaryUrl(imageId, imageVersion, {
              width: 96,
              height: 96,
            })}
            alt=""
            fill
            sizes="96px"
            className="object-cover"
          />
        ) : null}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        {item.headline ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {item.headline}
          </p>
        ) : null}
        <Link
          href={href}
          className="mt-0.5 line-clamp-2 font-medium hover:text-primary hover:underline"
        >
          {title}
        </Link>
        <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
          {detail.filter(Boolean).join(" · ")}
        </p>
        {item.blurb ? (
          <p className="mt-1 line-clamp-2 text-sm">{item.blurb}</p>
        ) : null}
      </div>
    </li>
  );
}
