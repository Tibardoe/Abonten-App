import {
  SocialMap,
  type SocialMapItem,
  type SocialMapLine,
} from "@/components/map/SocialMap";
import { useMarket } from "@/features/markets/MarketProvider";
import { placeCategoryLabel } from "@abonten/core/categoryLabels";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { derivePlaceCardOpenStatus } from "@abonten/core/computePlaceOpenStatus";
import { getEventCardDateTime } from "@abonten/core/dateFormatter";
import { formatMoney } from "@abonten/core/formatMoney";
import type { CoreTranslator } from "@abonten/core/i18n/translator";
import { parseWKBHex } from "@abonten/core/parseWKBHex";
import {
  type DistanceUnit,
  formatDistance,
} from "@abonten/core/units/distance";
import type { PlaceType } from "@abonten/types/placeType";
import type { UserPostType } from "@abonten/types/postsType";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useMemo } from "react";

// Adapter: the current Explore tab's filtered rows -> SocialMap markers.
// Same WKB-hex location parsing the old pin map used; the visual treatment
// (photo markers, preview card, clustering) lives in SocialMap. Each row
// becomes two card lines with an icon: events say when, then where (with
// the distance first when it is known); places say whether they are open
// and what they are, then where.

type Kind = "events" | "places";

function pointOf(row: { location?: string | null }): {
  lat: number;
  lng: number;
} | null {
  if (!row.location) return null;
  try {
    const { eventLat, eventLng } = parseWKBHex(row.location);
    if (!Number.isFinite(eventLat) || !Number.isFinite(eventLng)) return null;
    return { lat: eventLat, lng: eventLng };
  } catch {
    return null;
  }
}

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

function eventItem(
  e: UserPostType,
  unit: DistanceUnit,
  locale: string,
  t: Translate,
  tc: CoreTranslator,
): SocialMapItem | null {
  const point = pointOf(e as unknown as { location?: string });
  if (!point) return null;
  const dt = getEventCardDateTime(
    e.starts_at,
    e.ends_at,
    e.occurrences,
    e.timezone,
    locale,
  );
  const venue = e.address?.full_address || t("locationNotSpecified");
  const price = e.min_price ?? e.ticket_price;
  const currency = e.currency ?? e.ticket_currency ?? null;
  const distanceKm = (e as { distance_km?: number }).distance_km;
  const lines: SocialMapLine[] = [
    {
      icon: "calendar-outline",
      text: [dt.date, dt.time].filter(Boolean).join(" · ") || t("dateTbc"),
    },
    {
      icon: "location-outline",
      text:
        typeof distanceKm === "number"
          ? `${formatDistance(distanceKm * 1000, unit, locale)} · ${venue}`
          : venue,
    },
  ];
  return {
    id: e.id,
    kind: "event",
    title: e.title,
    imageUrl:
      e.flyer_public_id && e.flyer_version
        ? buildCloudinaryUrl(e.flyer_public_id, e.flyer_version, {
            width: 160,
            height: 160,
          })
        : null,
    point,
    lines,
    tag:
      price == null || price === 0
        ? tc("searchFilters.price.free")
        : formatMoney(currency, price, { trimZeroFraction: true, locale }),
  };
}

function placeItem(p: PlaceType, tc: CoreTranslator): SocialMapItem | null {
  const point = pointOf(p as unknown as { location?: string });
  if (!point) return null;
  const open = derivePlaceCardOpenStatus(
    tc,
    p.is_open,
    p.temporary_status ?? null,
  );
  const address =
    p.address && typeof p.address === "object" && "full_address" in p.address
      ? String((p.address as { full_address: string }).full_address ?? "")
      : "";
  const lines: SocialMapLine[] = [
    {
      icon: open.isOpen ? "time" : "time-outline",
      text: [
        open.label,
        placeCategoryLabel(tc, {
          slug: p.category_slug,
          name: p.category_name,
        }),
      ]
        .filter(Boolean)
        .join(" · "),
      tone: open.isOpen ? "success" : undefined,
    },
  ];
  if (address) lines.push({ icon: "location-outline", text: address });
  const rating = p.avg_rating ?? 0;
  return {
    id: p.id,
    kind: "place",
    title: p.name,
    imageUrl:
      p.cover_public_id && p.cover_version
        ? buildCloudinaryUrl(p.cover_public_id, p.cover_version, {
            width: 160,
            height: 160,
          })
        : null,
    point,
    lines,
    tag: rating > 0 ? `★ ${rating.toFixed(1)}` : null,
  };
}

export function ExploreMap({
  kind,
  events,
  places,
  center,
}: {
  kind: Kind;
  events: UserPostType[];
  places: PlaceType[];
  center: { lat: number; lng: number } | null;
}) {
  const t = useTranslations("explore");
  const tc = useTranslations("core");
  const { locale } = useLocale();

  const { context } = useMarket();
  const unit: DistanceUnit = context?.distanceUnit ?? "km";
  const items = useMemo<SocialMapItem[]>(() => {
    const src =
      kind === "events"
        ? events.map((e) => eventItem(e, unit, locale, t, tc))
        : places.map((p) => placeItem(p, tc));
    return src.filter((x): x is SocialMapItem => x != null);
  }, [kind, events, places, unit, locale, t, tc]);

  return (
    <SocialMap
      items={items}
      center={center}
      emptyLabel={t("noToMapHere", { kind: kind })}
    />
  );
}
