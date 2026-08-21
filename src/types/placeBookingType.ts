// Types for the Places Phase 2, Milestone 4 booking-request feature. Manual
// interfaces, same style as src/types/placeType.ts's PlaceClaimRequest — no
// generated Supabase types exist in this repo (see PROJECT.md). Field names/
// shapes here must match
// supabase/migrations/20260825090000_add_place_bookings.sql exactly.
//
// Reservation REQUEST only (confirmed scope) — no in-app payment, no
// inventory/slot-capacity model. The owner accepts or declines; money (if
// any) changes hands off-platform.

export type BookingStatus = "pending" | "accepted" | "declined" | "cancelled";

export type PlaceBooking = {
  id: string;
  place_id: string;
  service_id: string | null;
  customer_id: string;
  requested_time: string;
  party_size: number | null;
  note: string | null;
  status: BookingStatus;
  created_at: string;
  updated_at: string;
};

// Row shape returned by getPlaceBookings.ts (owner view) — joined to the
// customer's username and the requested service's name, per the milestone
// spec's "joined to user_info!customer_id(username) and
// place_service(name)".
export type OwnerPlaceBooking = PlaceBooking & {
  user_info: { username: string } | null;
  place_service: { name: string } | null;
};

// Row shape returned by getUserBookings.ts (customer view) — joined to the
// place's name/slug so a booking row can link back to /places/[slug].
export type CustomerPlaceBooking = PlaceBooking & {
  place: { name: string; slug: string } | null;
};
