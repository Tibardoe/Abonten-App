import { NotFoundError } from "@/lib/queryErrors";
import { supabase } from "@/lib/supabase";
import { isUuid } from "@/lib/uuid";
import type { PlaceOpeningHourRow } from "@abonten/core/computePlaceOpenStatus";
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
    { data: reviews },
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
    supabase
      .from("place_review")
      .select("rating")
      .eq("place_id", place.id)
      .eq("status", "approved"),
  ]);

  const reviewRows = (reviews ?? []) as { rating: number }[];
  const reviewCount = reviewRows.length;
  const avgRating =
    reviewCount > 0
      ? Number(
          (
            reviewRows.reduce((sum, r) => sum + r.rating, 0) / reviewCount
          ).toFixed(1),
        )
      : 0;

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
