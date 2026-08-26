import type { Occurrence } from "./occurrenceType";
import type { CheckoutSessionStatus, Ticket } from "./ticketType";

// export type PostsType = {
//   id?: string;
//   slug?: string;
//   title?: string;
//   description?: string;
//   event_category?: string;
//   event_type: string;
//   price?: number | string;
//   currency?: string;
//   location?: string;
//   latitude?: number;
//   longitude?: number;
//   address?: string;
//   capacity?: number;
//   created_at?: Date;
//   organizer_id?: string;
//   event_type_id?: number;
//   website_url?: string;
//   flyer_public_id?: string;
//   flyer_version?: string;
//   selectedFlyer: File;
//   start_at?: Date | string;
//   end_at?: Date | string;
//   timezone?: string;
//   status?: string;
//   flyerUrl?: string;
// };

export type PostsType = {
  address: string;
  latitude: number;
  longitude: number;
  category: string;
  types: string[];
  starts_at?: Date | undefined;
  ends_at?: Date | undefined;
  specific_dates?: {
    start: Date;
    end: Date;
  }[];
  title: string;
  checked: boolean;
  description: string;
  website_url?: string | undefined;
  price?: number | undefined;
  capacity?: number | undefined;
  // Optional when publishing a continued draft whose flyer wasn't replaced
  // — postEvent falls back to existingFlyer below instead of re-uploading.
  selectedFile: File | null;
  // Set when the flyer was already uploaded as part of an event draft and
  // hasn't been replaced — lets postEvent skip a redundant Cloudinary
  // upload and pass the existing asset straight to create_event.
  existingFlyer?: { public_id: string; version: string };
  // The draft this event is being published from, if any. Deleted only
  // after create_event succeeds — a failed publish leaves the draft intact.
  draftId?: string;
  currency: string | null | undefined;
  freeEvents: string | null;
  singleTicket: number | null;
  singleTicketQuantity: number | null;
  multipleTickets: Ticket[];
  promoCodes: {
    promoCode: string;
    discount: number;
    maximumUse: number;
    expiryDate: Date;
  }[];
  // Generated once per upload-modal session and reused across retries of
  // the same submission, so create_event can recognize a network retry or
  // a double submit and return the already-created event instead of
  // inserting a duplicate.
  clientRequestId: string;
  // The Abonten Place this event happens at, if the organizer picked one as
  // the venue instead of (or alongside) typing a free-text address — see
  // useEventUploadForm.ts's selectedPlaceId. Optional/nullable: most events
  // still have no associated Place.
  placeId?: string | null;
};

export type EventDates = {
  starts_at?: Date;
  ends_at?: Date;
  specific_dates?: {
    start: Date;
    end: Date;
  }[];
};

export type UserPostType = {
  id: string;
  ticket_type?: { price: number; currency: string }[]; // ✅ Fix here
  created_at: Date | undefined;
  organizer_id?: string;
  event_category?: string;
  flyer_public_id?: string;
  flyer_version?: string;
  address: { full_address: string };
  starts_at?: Date | undefined;
  ends_at?: Date | undefined;
  event_code: string;
  occurrences?: Occurrence[];
  event_occurrence?: Occurrence[];
  title: string;
  capacity?: number | undefined;
  min_price?: number | undefined;
  currency: string;
  flyerUrl?: string;
  minTicket?: { price: number; currency: string };
  attendanceCount?: number | null;
  attendance_count?: number | null;
  ticket_price?: number | undefined;
  ticket_currency?: string;
  status?: string;
  featured?: boolean;
  distance_km?: number | null;
  // Raw PostGIS geography value as returned by PostgREST — not parsed here,
  // same as PlaceType.location. Only populated by get_nearby_events and
  // get_filtered_events; every other UserPostType producer omits it.
  location?: string;
};

// Row shape for event_promotion_tier -- Unified Event Management, Event
// Promotion milestone. Field names must match
// supabase/migrations/20260829090000_add_event_promotions.sql exactly.
// Mirrors PlacePromotionTier.
export type EventPromotionTier = {
  id: number;
  duration_label: string;
  duration: string;
  price: number;
  currency: string;
  is_active: boolean;
};

// Discriminated-union sibling of placeType.ts's PlacePromotionSummaryProps,
// consumed by the same OrderSummary component -- an Event Promotion purchase
// is a single, standalone purchase with no basket concept, same shape as a
// place promotion purchase.
export type EventPromotionSummaryProps = {
  type: "event-promotion";
  eventTitle: string;
  tierLabel: string;
  amount: number;
  totalAmount: number;
  status: CheckoutSessionStatus;
  expiresAt: string | null;
};
