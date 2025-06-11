export type FavoriteEvents = {
  user_id: string;
  event_id: string;
  created_at: Date;
  deleted_at: Date;
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
    created_at: Date;
    organizer_id: string;
    event_type_id: number;
    website_url: string;
    flyer_public_id: string;
    flyer_version: string;
    starts_at?: Date;
    event_code: string;
    ends_at?: Date;
    event_dates?: Date[];
    timezone: string;
    status: string;
    ticket_type?: { price: number; currency: string }[];
  };
};

export type TicketType = {
  price: number;
  currency: string;
};
