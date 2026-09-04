import type { Occurrence } from "./occurrenceType";

export type FavoriteEvents = {
  user_id: string;
  event_id: string;
  // Postgres returns these as ISO timestamp strings over PostgREST -- they
  // were never actually Date objects at runtime.
  created_at: string;
  deleted_at: string;
  event: {
    id: string;
    slug: string;
    title: string;
    description: string;
    caegory_id: number;
    price?: number;
    currency?: string;
    attendanceCount?: number | null;
    location: string;
    address: { full_address: string };
    capacity: number;
    created_at: string;
    organizer_id: string;
    event_type_id: number;
    website_url: string;
    flyer_public_id: string;
    flyer_version: string;
    starts_at?: Date;
    event_code: string;
    ends_at?: Date;
    occurrences?: Occurrence[];
    event_occurrence?: Occurrence[];
    timezone: string;
    status: string;
    ticket_type?: { price: number; currency: string }[];
  };
};

export type TicketType = {
  price: number;
  currency: string;
};
