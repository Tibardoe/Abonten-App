import EventCard from "@/components/molecules/EventCard";
import PlaceCard from "@/places/molecules/PlaceCard";
import type { WeeklyItem } from "@abonten/types/weeklyType";

// One featured listing: the editor's optional headline above the existing
// event or place card (which already carries save, share, directions and the
// cancelled / sold-out / ended overlays), and the optional note below it.
// The cards render their own <li>, so they sit in a one-item list here.
export default function WeeklyItemFrame({
  item,
  priority = false,
  className,
  reserveHeadline = false,
}: {
  item: WeeklyItem;
  priority?: boolean;
  className?: string;
  /** Keep a headline line even when this item has none, so cards in a row line up. */
  reserveHeadline?: boolean;
}) {
  const card = item.event ? (
    <EventCard {...item.event} priority={priority} />
  ) : item.place ? (
    <PlaceCard {...item.place} priority={priority} />
  ) : null;
  if (!card) return null;

  return (
    <li className={className ?? "flex min-w-0 flex-col gap-1.5"}>
      {item.headline ? (
        <p className="line-clamp-1 text-xs leading-4 font-semibold uppercase tracking-wide text-primary">
          {item.headline}
        </p>
      ) : reserveHeadline ? (
        <span aria-hidden className="block h-4" />
      ) : null}
      <ul className="contents">{card}</ul>
      {item.blurb ? (
        <p className="line-clamp-3 whitespace-pre-line px-1 text-sm text-muted-foreground">
          {item.blurb}
        </p>
      ) : null}
    </li>
  );
}
