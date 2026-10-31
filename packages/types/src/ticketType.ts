import type { Occurrence } from "./occurrenceType";

export type Ticket = {
  category?: string;
  price: number;
  quantity?: number | null;
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
  quantity?: number | null;
  currency?: string;
  type: string;
  available_from?: Date;
  available_until?: Date;
};

export type UserTicketType = {
  id: string;
  user_id: string;
  transaction_id: string | null;
  transaction: {
    status: string;
    refund_requested_at: string | null;
    // Only populated when fetched via TICKET_REFUND_SELECT (the Refunds
    // tab) — Active/Cancelled use TICKET_WITH_EVENT_SELECT, which doesn't
    // need these for its own display.
    amount?: number;
    currency?: string;
  } | null;
  /** This ticket's own refunds (a payment refunded ticket by ticket). */
  refund_parts?: {
    refund: {
      status: string;
      amount: number;
      currency: string;
      created_at: string;
      tickets?: { ticket_id: string }[];
    } | null;
  }[];
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
    /** The event's IANA zone; ticket times read on the venue's clock. */
    timezone?: string | null;
    country_code?: string | null;
    currency?: string | null;
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
    occurrences: Occurrence[];
  };
};

export type CheckoutSessionStatus =
  | "pending"
  | "paid"
  | "expired"
  | "cancelled";

/**
 * What cancelling one of the buyer's tickets would give back, asked before
 * the cancel dialog opens (ticketCancelQuoteCore). A cash payment is
 * refunded ticket by ticket; one made with Abonten Credit or paid small
 * small only as a whole, so its tickets are cancelled together.
 */
export type TicketCancelQuote = {
  /** Paid with money or credit; a free ticket has nothing to give back. */
  paid: boolean;
  /** The buyer's other active tickets that go with this one (a payment
   *  refunded only as a whole). */
  otherTicketIds: string[];
  /** The buyer's other active tickets from the payment that stay valid. */
  keptTicketCount: number;
  /** The buyer's active tickets for this ticket's event (this one too),
   *  across payments: more than one offers "cancel all for this event". */
  eventTicketCount: number;
  /** Some of those are for another event (a basket paid at once). */
  otherEvents: boolean;
  /** A ticket from that payment was checked in: nothing can be refunded. */
  checkedIn: boolean;
  /** What the cancellation gives back, in minor units; null when unknown. */
  refund: { cashMinor: number; creditMinor: number; currency: string } | null;
};

/**
 * What cancelling all of the buyer's active tickets for an event would give
 * back (eventCancelQuoteCore), across every payment they bought them in.
 */
export type EventCancelQuote = {
  ticketIds: string[];
  /** At least one of them was paid for. */
  paid: boolean;
  /** Summed over the payments, in minor units; null when unknown. */
  refund: { cashMinor: number; creditMinor: number; currency: string } | null;
  /** Why they can't all go: a payment refunded only as a whole also paid
   *  for another event's tickets, or one of its tickets was checked in. */
  blocked: "other_events" | "checked_in" | null;
};
