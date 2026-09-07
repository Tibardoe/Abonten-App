import { NotFoundError } from "@/lib/queryErrors";
import { supabase } from "@/lib/supabase";
import { isUuid } from "@/lib/uuid";
import type { PlaceOpeningHourRow } from "@abonten/core/computePlaceOpenStatus";
import { parseRatingAggregate, roundRating } from "@abonten/core/ratings";
import { useQuery } from "@tanstack/react-query";

// Mirrors getPlaceBySlug.ts (the web place detail fetch) but keyed by id —
// the mobile PlaceCard carries `place.id`, not the slug. `place` and its
// child tables all allow a public select scoped to `status = 'published'`.

export type PlaceDetail = {
  id: string;
  name: string;
  slug: string;
  description: string;
  address: { full_address?: string } | null;
  /** PostGIS WKB hex — parse with parseWKBHex for the map / similar-places. */
  location: string | null;
  category_id: number | null;
  owner_id: string | null;
  website_url: string | null;
  phone: string | null;
  whatsapp: string | null;
  cover_public_id: string;
  cover_version: string;
  temporary_status: string | null;
  claimed: boolean;
  verified: boolean;
  place_category: { name: string; slug: string } | null;
  openingHours: PlaceOpeningHourRow[];
  services: {
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    price_unit: string | null;
    show_price: boolean;
  }[];
  photos: { id: string; public_id: string; version: string }[];
  avgRating: number;
  reviewCount: number;
};

async function fetchPlaceDetail(id: string): Promise<PlaceDetail> {
  if (!isUuid(id)) throw new NotFoundError("Place");

  const { data: place, error } = await supabase
    .from("place")
    .select("*, place_category(name, slug)")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();

  if (error) throw error;
  if (!place) throw new NotFoundError("Place");

  const [
    { data: openingHours },
    { data: services },
    { data: photos },
    { data: ratingRow },
  ] = await Promise.all([
    supabase
      .from("place_opening_hours")
      .select("*")
      .eq("place_id", place.id)
      .order("day_of_week", { ascending: true }),
    supabase
      .from("place_service")
      .select("*")
      .eq("place_id", place.id)
      .order("position", { ascending: true }),
    supabase
      .from("place_photo")
      .select("*")
      .eq("place_id", place.id)
      .order("position", { ascending: true }),
    // Aggregated in Postgres (get_place_rating) rather than transferring
    // every approved review row for this place, still inside the same
    // Promise.all so it stays one parallel round trip.
    supabase
      .rpc("get_place_rating", { p_place_id: place.id })
      .maybeSingle(),
  ]);

  const rating = parseRatingAggregate(ratingRow);
  const reviewCount = rating.count;
  const avgRating = roundRating(rating.average);

  return {
    ...(place as unknown as Omit<
      PlaceDetail,
      "openingHours" | "services" | "photos" | "avgRating" | "reviewCount"
    >),
    openingHours: (openingHours ?? []) as PlaceOpeningHourRow[],
    services: (services ?? []) as PlaceDetail["services"],
    photos: (photos ?? []) as PlaceDetail["photos"],
    avgRating,
    reviewCount,
  };
}

export function usePlaceDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["mobile", "place", id],
    enabled: !!id,
    queryFn: () => fetchPlaceDetail(id ?? ""),
  });
}
