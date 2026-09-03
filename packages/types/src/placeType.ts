// Types for the Places feature (Phase 1). Manual interfaces, same style as
// src/types/postsType.ts — no generated Supabase types exist in this repo
// (see PROJECT.md). Field names/shapes here must match
// supabase/migrations/20260820090000_add_places_feature.sql exactly.

import type { CheckoutSessionStatus } from "./ticketType";

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
  // Required unless the place is being published from a continued draft
  // that already has a cover photo uploaded (see existingCoverPhoto) —
  // mirrors PostsType.selectedFile/existingFlyer.
  selectedFile: File | null;
  // Set when continuing a draft whose cover photo was already uploaded to
  // Cloudinary and the owner hasn't picked a replacement this session.
  existingCoverPhoto?: { public_id: string; version: string };
  openingHours: PlaceOpeningHoursInput[];
  services?: PlaceServiceInput[];
  // Generated once per submission and reused across retries, so
  // create_place can recognize a network retry or a double submit and
  // return the already-created place instead of inserting a duplicate
  // (mirrors PostsType.clientRequestId / create_event's same convention).
  clientRequestId: string;
  // Set when publishing from a continued draft — deleted server-side once
  // the place is actually created (mirrors PostsType.draftId).
  draftId?: string;
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

// Row shape for the admin claim-request review list (Places Phase 2,
// Milestone 2). Field names/shapes here must match
// supabase/migrations/20260824090000_add_place_claim_requests.sql exactly.
// `place`/`user_info` are the joined rows from getPlaceClaimRequests.ts's
// `place(name, slug)` / `user_info!claimant_id(username)` select.
export type PlaceClaimRequest = {
  id: string;
  place_id: string;
  claimant_id: string;
  note: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  place: { name: string; slug: string } | null;
  user_info: { username: string } | null;
  // §12: count of private supporting documents attached to this claim.
  // Populated by getPlaceClaimRequests.ts via a `place_claim_document(count)`
  // embed; the documents themselves come from getPlaceClaimDocuments.ts.
  document_count?: number;
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

// Row shape for place_promotion_tier -- Places Phase 2, Milestone 5,
// Featured Places. Field names must match
// supabase/migrations/20260826090000_add_place_promotions.sql exactly.
export type PlacePromotionTier = {
  id: number;
  duration_label: string;
  duration: string;
  price: number;
  currency: string;
  is_active: boolean;
};

// Discriminated-union sibling of postsType.ts's EventPromotionSummaryProps,
// consumed by the same OrderSummary component -- a Featured Places purchase
// is a single, standalone purchase with no basket concept, same shape as an
// event promotion purchase.
export type PlacePromotionSummaryProps = {
  type: "promotion";
  placeName: string;
  tierLabel: string;
  amount: number;
  totalAmount: number;
  status: CheckoutSessionStatus;
  expiresAt: string | null;
};
