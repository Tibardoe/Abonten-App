export type Ticket = {
  category?: string;
  price: number;
  quantity?: number;
  availableFrom?: Date;
  availableUntil?: Date;
  currency?: string;
  type?: string;
  available_from?: Date;
  available_until?: Date;
};

export type TicketType = {
  id: string;
  price: number;
  quantity?: number;
  currency?: string;
  type: string;
  available_from?: Date;
  available_until?: Date;
};

export type UserTicketType = {
  id: string;
  user_id: string;
  transaction_id: string | null;
  seat_number: string | null;
  status: "active" | "cancelled" | string;
  qr_public_id: string;
  qr_version: string;
  issued_at: string; // ISO timestamp
  expires_at: string; // ISO timestamp
  used_at: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string | null;
  ticket_type_id: string;
  ticket_code: string;
  ticket_type: {
    id: string;
    type: string;
    price: number;
    currency: string;
    event_id: string;
    quantity: number;
    created_at: string;
    available_from: string | null;
    available_until: string | null;
  };
  event: {
    id: string;
    organizer_id: string;
    event_category: string;
    event_type: string; // Stored as JSON string, consider parsing it
    title: string;
    slug: string;
    description: string;
    location: string;
    address: { full_address: string }; // You can specify a better type if you know the shape of address
    website_url: string;
    capacity: number;
    flyer_public_id: string;
    flyer_version: string;
    starts_at: string | null;
    ends_at: string | null;
    status: string;
    created_at: string;
    event_code: string;
    event_dates: Date[]; // You can specify a better type if you know it
  };
};

export type TicketData = {
  quantity: number;
  discount?: number;
  amount?: number;
  type: string;
};

export type TicketSummaryItem = {
  type: string;
  quantity: number;
  discount: number;
  amount: number;
  unitPrice: string;
  currency: string;
};

export type TicketSummaryProps = {
  type: "ticket";
  eventTitle: string;
  ticketSummary: TicketSummaryItem[];
  totalAmount: number;
};

export type SubscriptionSummaryProps = {
  type: "subscription";
  planName: string;
  amount: number;
  features: string[];
  totalAmount: number;
};
