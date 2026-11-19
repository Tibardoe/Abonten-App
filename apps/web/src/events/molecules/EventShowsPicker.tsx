import { eventPath } from "@abonten/core/seo/paths";
import { formatInTimeZone } from "@abonten/core/time/timeZone";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

type Show = {
  id: string;
  event_code: string;
  starts_at: string;
  timezone: string;
  status: string;
  seats_left: number | null;
  sold_out: boolean;
};

/**
 * The other shows of a run (docs/architecture/show-runs.md): each show is
 * its own listing with its own seats, so picking one opens its page. Shown
 * only when the listing belongs to a run with more than one upcoming show.
 */
export default async function EventShowsPicker({
  shows,
  currentId,
}: {
  shows: Show[] | null | undefined;
  currentId: string;
}) {
  const list = shows ?? [];
  if (list.length < 2) return null;
  const t = await getTranslations("events");
  const locale = await getLocale();

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t("chooseAShow")}</p>
      <ul className="grid grid-cols-2 gap-2">
        {list.map((show) => {
          const current = show.id === currentId;
          const unavailable = show.sold_out || show.status === "canceled";
          const day = formatInTimeZone(
            show.starts_at,
            show.timezone,
            { weekday: "short", day: "numeric", month: "short" },
            locale,
          );
          const time = formatInTimeZone(
            show.starts_at,
            show.timezone,
            { hour: "numeric", minute: "2-digit" },
            locale,
          );
          return (
            <li key={show.id}>
              <Link
                href={eventPath(show.event_code)}
                aria-current={current ? "page" : undefined}
                className={`block rounded-lg border px-3 py-2 text-sm transition-colors ${
                  current
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary"
                } ${unavailable ? "opacity-60" : ""}`}
              >
                <span className="block font-medium">{day}</span>
                <span className="block text-muted-foreground">
                  {time}
                  {" · "}
                  {show.status === "canceled"
                    ? t("showCancelled")
                    : show.sold_out
                      ? t("showSoldOut")
                      : show.seats_left != null
                        ? t("showSeatsLeft", { count: show.seats_left })
                        : t("showOnSale")}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
