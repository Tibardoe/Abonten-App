import type { Ticket } from "./ticketType";

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
  specific_dates?: Date[];
  title: string;
  description: string;
  website_url?: string | undefined;
  price?: number | undefined;
  capacity?: number | undefined;
  selectedFile: File;
  currency: string;
  freeEvents: string;
  singleTicket: number | null;
  multipleTickets: Ticket[];
  promoCodes: {
    promoCode: string;
    discount: number;
    maximumUse: number;
    expiryDate: Date;
  }[];
};

export type EventDates = {
  starts_at?: Date;
  ends_at?: Date;
  specific_dates?: Date[];
};

export type UserPostType = {
  id: string;
  ticket_type?: { price: number; currency: string }[]; // ✅ Fix here
  created_at: Date | undefined;
  event_category?: string;
  flyer_public_id?: string;
  flyer_version?: string;
  address: { full_address: string };
  starts_at?: Date | undefined;
  ends_at?: Date | undefined;
  event_dates?: Date[] | [];
  title: string;
  capacity?: number | undefined;
  min_price?: number | undefined;
  currency: string;
  flyerUrl?: string;
  minTicket?: { price: number; currency: string };
  attendanceCount: number | null;
  ticket_price?: number | undefined;
  ticket_currency?: string;
};
