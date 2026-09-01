import { logger } from "@abonten/core/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

// Everything the native per-place management screens need to prefill their
// forms, in one owner-scoped read — the mobile echo of what
// manage/places/[placeId]/page.tsx assembles server-side and passes down as
// props (place row + weekly hours + services). Deliberately NOT a
// "use server" file.

export type PlaceManageContext = {
  place: {
    id: string;
    name: string;
    description: string;
    category_id: number;
    website_url: string | null;
    phone: string | null;
    whatsapp: string | null;
    social_links: Record<string, string> | null;
    address: { full_address?: string } | null;
    cover_public_id: string | null;
    cover_version: string | null;
    temporary_status: "temporarily_closed" | "permanently_closed" | null;
    temporary_status_note: string | null;
  };
  openingHours: {
    day_of_week: number;
    open_time: string | null;
    close_time: string | null;
    is_closed: boolean;
  }[];
  services: {
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    price_unit: string | null;
    show_price: boolean;
    position: number;
  }[];
};

export type PlaceManageContextResult =
  | { status: 403 | 404 | 500; message: string }
  | { status: 200; data: PlaceManageContext };

export async function fetchPlaceManageContext(
  supabase: SupabaseClient,
  userId: string,
  placeId: string,
): Promise<PlaceManageContextResult> {
  const { data: place, error: placeError } = await supabase
    .from("place")
    .select(
      "id, owner_id, name, description, category_id, website_url, phone, whatsapp, social_links, address, cover_public_id, cover_version, temporary_status, temporary_status_note",
    )
    .eq("id", placeId)
    .maybeSingle();

  if (placeError || !place) {
    return { status: 404, message: "Place not found" };
  }

  if (place.owner_id !== userId) {
    return { status: 403, message: "Not authorized to manage this place" };
  }

  const [
    { data: openingHours, error: hoursError },
    { data: services, error: servicesError },
  ] = await Promise.all([
    supabase
      .from("place_opening_hours")
      .select("day_of_week, open_time, close_time, is_closed")
      .eq("place_id", placeId)
      .order("day_of_week", { ascending: true }),
    supabase
      .from("place_service")
      .select("id, name, description, price, price_unit, show_price, position")
      .eq("place_id", placeId)
      .order("position", { ascending: true }),
  ]);

  if (hoursError || servicesError) {
    logger.error(
      `Error fetching place manage context: ${
        hoursError?.message ?? servicesError?.message
      }`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  return {
    status: 200,
    data: {
      place: {
        id: place.id,
        name: place.name,
        description: place.description,
        category_id: place.category_id,
        website_url: place.website_url,
        phone: place.phone,
        whatsapp: place.whatsapp,
        social_links: place.social_links,
        address: place.address,
        cover_public_id: place.cover_public_id,
        cover_version: place.cover_version,
        temporary_status: place.temporary_status,
        temporary_status_note: place.temporary_status_note,
      },
      openingHours: openingHours ?? [],
      services: services ?? [],
    },
  };
}
