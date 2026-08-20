// Types for the Places feature (Phase 1). Manual interfaces, same style as
// src/types/postsType.ts — no generated Supabase types exist in this repo
// (see PROJECT.md). Field names/shapes here must match
// supabase/migrations/20260820090000_add_places_feature.sql exactly.

export type PlaceOpeningHoursInput = {
  dayOfWeek: number; // 0 (Sunday) - 6 (Saturday) — place_opening_hours.day_of_week
  openTime: string | null; // "HH:MM" — null when isClosed
  closeTime: string | null;
  isClosed: boolean;
};

export type PlaceServiceInput = {
  name: string;
  description?: string;
  price?: number;
  priceUnit?: string;
  showPrice: boolean;
};

export type PlaceFormType = {
  name: string;
  categoryId: number;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  websiteUrl?: string;
  phone?: string;
  whatsapp?: string;
  socialLinks?: Record<string, string>;
  // Required on creation — unlike PostsType.selectedFile, there's no
  // existingFlyer-style fallback (Places has no draft flow in Phase 1).
  selectedFile: File;
  openingHours: PlaceOpeningHoursInput[];
  services?: PlaceServiceInput[];
  // Generated once per submission and reused across retries, so
  // create_place can recognize a network retry or a double submit and
  // return the already-created place instead of inserting a duplicate
  // (mirrors PostsType.clientRequestId / create_event's same convention).
  clientRequestId: string;
};

// Row shape returned by get_nearby_places / get_filtered_places — both RPCs
// share an identical RETURNS TABLE (see the migration). Each RPC also
// returns a cursor_distance_km column, consumed only inside the actions
// themselves for building the next cursor, so it's intentionally left off
// this type.
export type PlaceType = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string;
  category_id: number;
  category_name: string;
  category_slug: string;
  // Raw PostGIS geography value as returned by PostgREST — not parsed here,
  // same as `event.location` is never surfaced on UserPostType.
  location: string;
  address: { full_address: string } | Record<string, unknown>;
  website_url: string | null;
  phone: string | null;
  whatsapp: string | null;
  cover_public_id: string;
  cover_version: string;
  status: string;
  temporary_status: string | null;
  claimed: boolean;
  verified: boolean;
  created_at: string;
  avg_rating: number | null;
  review_count: number;
  is_open: boolean;
  distance_km: number | null;
};

export type PlaceCategory = {
  id: number;
  name: string;
  slug: string;
};

// Params accepted by getQueriedPlaces / get_filtered_places.
export type PlaceFilters = {
  searchText?: string | null;
  categoryId?: number | null;
  minRating?: number | null;
  openNow?: boolean | null;
  lat?: number | null;
  lng?: number | null;
  maxDistanceKm?: number | null;
  cursor?: string | null;
  pageSize?: number;
};
