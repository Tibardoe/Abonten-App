"use server";

import { createClient } from "@/config/supabase/server";

interface FilterParams {
  minPrice?: number | null;
  maxPrice?: number | null;
  minRating?: number | null;
  lat?: number | null;
  lng?: number | null;
  maxDistanceKm?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  searchText?: string | null;
  category?: string | string[] | undefined;
  type?: string | string[] | undefined;
}

export async function getQueriedEvents(queryParams: FilterParams) {
  const supabase = await createClient();

  const {
    minPrice = null,
    maxPrice = null,
    minRating = null,
    lat = null,
    lng = null,
    maxDistanceKm = null,
    startDate = null,
    endDate = null,
    searchText = null,
    category = null,
    type = null,
  } = queryParams;

  // Call your PostgreSQL function using supabase.rpc
  const { data, error } = await supabase.rpc("get_filtered_events", {
    p_min_price: minPrice,
    p_max_price: maxPrice,
    p_min_rating: minRating,
    p_user_lat: lat,
    p_user_lng: lng,
    p_max_distance_km: maxDistanceKm,
    p_start_date: startDate,
    p_end_date: endDate,
    p_search_text: searchText ?? "",
    p_event_category: category ?? "",
    p_event_type: type ?? "",
  });

  if (error) {
    console.error("Error fetching filtered events:", error);
    // throw new Error("Failed to fetch filtered events");
  }

  return { status: 200, QueriedData: data };
}
