import { z } from "zod";

// Group tickets and group prices (docs/architecture/group-tickets-and-prices.md):
// the shapes the transports accept. The rules (ranges, at most three tiers,
// a bigger group always gets more off) are @abonten/core/groupPricing's,
// checked by the services with messages in the person's language.

export const groupDiscountTierSchema = z.object({
  minTickets: z.number().int(),
  percentOff: z.number().int(),
});

export const setEventGroupDiscountsSchema = z.object({
  eventId: z.string().uuid(),
  tiers: z.array(groupDiscountTierSchema).max(10),
});
export type SetEventGroupDiscountsInput = z.infer<
  typeof setEventGroupDiscountsSchema
>;
