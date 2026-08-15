type TicketTypeQuantity = {
  quantity: number | null;
};

/**
 * `capacity` is the organizer-facing, authoritative spot count (shown as
 * "X spots"/"X remaining" everywhere). `ticket_type.quantity` is a separate,
 * independently-entered per-ticket-type stock counter that isn't guaranteed
 * to stay in sync with `capacity` (e.g. reserved-but-never-completed
 * checkouts can drain it toward 0 while capacity/attendance still show
 * plenty of room). So capacity is the source of truth whenever it's set;
 * ticket-type depletion is only consulted for uncapped events, where it's
 * the sole remaining signal that no ticket can currently be bought.
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

  if (hasCapacityLimit) {
    return attendeeCount >= capacity;
  }

  if (!ticketTypes || ticketTypes.length === 0) return false;

  return ticketTypes.every((t) => t.quantity !== null && t.quantity <= 0);
}
