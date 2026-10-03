// What an event list row says about room: how many are going, and what is
// left in each ticket tier.
//
// Every event list function returns these inline (`attendance_count`, and
// `ticket_types` as [{ price, currency, quantity }]; migration
// 20261002180000), so a card can say "Sold out" or "3 spots left" without a
// second request. Cards read `attendanceCount` and `ticket_type`; this is
// the one place the row's names become the card's.

export type TicketTier = {
  price: number;
  currency: string;
  /** Remaining stock; null for a tier with no limit. */
  quantity: number | null;
};

/** The tiers of a list row, or undefined when the row does not carry them. */
export function readTicketTiers(value: unknown): TicketTier[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry) => {
    const tier = (entry ?? {}) as Record<string, unknown>;
    return {
      price: Number(tier.price ?? 0) || 0,
      currency: typeof tier.currency === "string" ? tier.currency : "",
      quantity: tier.quantity == null ? null : Number(tier.quantity),
    };
  });
}

type ListRow = {
  attendance_count?: number | string | null;
  ticket_types?: unknown;
  ticket_type?: unknown;
};

/**
 * A list row with the two fields a card reads. A row that already has
 * `ticket_type` (a detail read) keeps it; a row with neither stays without
 * tiers, which puts the card on its capacity figure alone.
 */
export function withInlineEventAvailability<T extends ListRow>(
  row: T,
): Omit<T, "ticket_type"> & {
  attendanceCount: number;
  ticket_type?: TicketTier[];
} {
  const own = readTicketTiers(row.ticket_type);
  return {
    ...row,
    attendanceCount: Number(row.attendance_count ?? 0) || 0,
    ticket_type: own ?? readTicketTiers(row.ticket_types),
  };
}
