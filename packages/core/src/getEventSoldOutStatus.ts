type TicketTypeQuantity = {
  // null = an unlimited tier; undefined = the caller's row didn't carry a
  // quantity at all. Both mean "this tier imposes no known stock limit", so
  // neither can make an event look sold out.
  quantity?: number | null;
};

/**
 * An event is sold out when EITHER of its two independent limits is used up.
 *
 * `capacity` is the organizer-facing headcount cap ("X spots").
 * `ticket_type.quantity` is remaining stock: create_ticket_checkout decrements
 * it when a cart is reserved, and expire_stale_ticket_checkouts (cron, every
 * 5 minutes) adds it back if that cart is abandoned. So a zero there means the
 * seats really are unavailable right now, whether sold or held.
 *
 * This used to treat capacity as the sole source of truth whenever it was set,
 * on the reasoning that half-finished checkouts could drain stock while
 * capacity still showed room. The restock job bounds that window to a few
 * minutes, and the cost of ignoring stock was much worse than the cost of a
 * brief "Sold out": an event with capacity 100 and 3 tickets kept advertising
 * "Buy tickets" and "100 spots left" after all 3 were gone, so buyers only
 * found out at the checkout call. Exhausted stock now counts, and an event
 * with no ticket types at all is still governed by capacity alone.
 */
export function getEventSoldOutStatus({
  capacity,
  attendeeCount,
  ticketTypes,
}: {
  capacity: number | null | undefined;
  attendeeCount: number;
  ticketTypes?: TicketTypeQuantity[];
}): boolean {
  const hasCapacityLimit = !!capacity && capacity > 0;

  if (hasCapacityLimit && attendeeCount >= capacity) return true;

  if (!ticketTypes || ticketTypes.length === 0) return false;

  // A null quantity means "unlimited stock for this tier", so the event can
  // never be sold out on stock while one of those is on sale.
  return ticketTypes.every((t) => t.quantity != null && t.quantity <= 0);
}

/**
 * Seats a buyer can still take, or null when nothing limits them.
 *
 * Both limits apply, so the honest number is the smaller of "room under
 * capacity" and "stock left across every ticket type" — a card that shows
 * only the capacity figure tells buyers 100 seats are free when 3 tickets
 * were ever printed. Ticket types are optional here because the discovery
 * RPCs don't all carry them; without them this falls back to capacity, which
 * is the previous behaviour.
 */
export function getEventSpotsLeft({
  capacity,
  attendeeCount,
  ticketTypes,
}: {
  capacity: number | null | undefined;
  attendeeCount: number;
  ticketTypes?: TicketTypeQuantity[];
}): number | null {
  const hasCapacityLimit = !!capacity && capacity > 0;
  const capacityLeft = hasCapacityLimit
    ? Math.max(capacity - attendeeCount, 0)
    : null;

  const hasStockLimit =
    !!ticketTypes &&
    ticketTypes.length > 0 &&
    ticketTypes.every((t) => t.quantity != null);
  const stockLeft = hasStockLimit
    ? ticketTypes.reduce((sum, t) => sum + Math.max(t.quantity ?? 0, 0), 0)
    : null;

  if (capacityLeft === null) return stockLeft;
  if (stockLeft === null) return capacityLeft;
  return Math.min(capacityLeft, stockLeft);
}
