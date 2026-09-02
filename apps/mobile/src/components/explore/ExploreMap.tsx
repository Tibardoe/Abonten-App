import { SocialMap, type SocialMapItem } from "@/components/map/SocialMap";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { derivePlaceCardOpenStatus } from "@abonten/core/computePlaceOpenStatus";
import { getEventCardDateTime } from "@abonten/core/dateFormatter";
import { parseWKBHex } from "@abonten/core/parseWKBHex";
import type { PlaceType } from "@abonten/types/placeType";
import type { UserPostType } from "@abonten/types/postsType";
import { useMemo } from "react";

// Adapter: the current Explore tab's filtered rows -> SocialMap markers.
// Same WKB-hex location parsing the old pin map used; the visual treatment
// (photo markers, preview card, clustering) lives in SocialMap.

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

function eventItem(e: UserPostType): SocialMapItem | null {
  const point = pointOf(e as unknown as { location?: string });
  if (!point) return null;
  const dt = getEventCardDateTime(e.starts_at, e.ends_at, e.occurrences);
  const venue = e.address?.full_address || "Location not specified";
  const price = e.min_price ?? e.ticket_price;
  const currency = e.currency ?? e.ticket_currency ?? "GHS";
  const lines = [
    [dt.date, dt.time].filter(Boolean).join("  ·  ") || "Date TBC",
    venue,
  ];
  if (typeof (e as { distance_km?: number }).distance_km === "number") {
    lines.push(
      `${(e as { distance_km: number }).distance_km.toFixed(1)} km away`,
    );
  }
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
        ? "Free"
        : `${currency} ${price.toLocaleString()}`,
  };
}

function placeItem(p: PlaceType): SocialMapItem | null {
  const point = pointOf(p as unknown as { location?: string });
  if (!point) return null;
  const open = derivePlaceCardOpenStatus(p.is_open, p.temporary_status ?? null);
  const address =
    p.address && typeof p.address === "object" && "full_address" in p.address
      ? String((p.address as { full_address: string }).full_address ?? "")
      : "";
  const lines = [p.category_name || "Place", open.label];
  if (address) lines.push(address);
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
  const items = useMemo<SocialMapItem[]>(() => {
    const src =
      kind === "events" ? events.map(eventItem) : places.map(placeItem);
    return src.filter((x): x is SocialMapItem => x != null);
  }, [kind, events, places]);

  return (
    <SocialMap
      items={items}
      center={center}
      emptyLabel={`No ${kind} to map here`}
    />
  );
}
