// What makes an event "free", decided once for every client and the server.
//
// Free registration is its own path: one-click RSVP through the
// `issue_free_ticket` RPC, which looks the event's ticket_type up BY NAME
// (`type = 'FREE'`). Paid tiers go through checkout and Paystack, which
// cannot charge 0. So the rules are:
//   - an event offers free registration exactly when it has the FREE tier
//     (the create/update services only ever write that tier on its own);
//   - a paid tier must cost more than 0 and must not be called FREE.
// An earlier client-side test ("every tier costs 0") disagreed with the RPC:
// a 0-priced tier under another name showed "Reserve spot", and the server
// then refused it (and checkout could not have charged it either).

export const FREE_TICKET_TYPE = "FREE";

/** The event offers one-click free registration (the FREE tier). */
export function hasFreeRegistration(
  ticketTypes: readonly { type: string | null }[],
): boolean {
  return ticketTypes.some((t) => t.type === FREE_TICKET_TYPE);
}

/**
 * Why a paid tier cannot be saved, or null when it can. Used by every
 * create/update path before anything is written.
 */
export function paidTierProblem(tier: {
  type?: string | null;
  price: number;
}): string | null {
  if (!Number.isFinite(tier.price) || tier.price <= 0) {
    return "Paid tickets need a price greater than zero. To let people in for free, make the event free.";
  }
  if (tier.type?.trim().toUpperCase() === FREE_TICKET_TYPE) {
    return `"${FREE_TICKET_TYPE}" is reserved for free events. Give this ticket type another name.`;
  }
  return null;
}
