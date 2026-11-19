// The rules an organizer's group tickets and group prices must follow,
// checked by every create/update path before anything is written (the
// database re-checks the ranges). Reasons are codes; the words come from
// `groupPricing.*` of the core namespace, in the requester's language.
// The prices themselves are worked out by @abonten/core/checkoutPricing.

import type { GroupDiscountTier } from "./checkoutPricing";
import type { CoreTranslator } from "./i18n/translator";

/** People one purchase of a ticket type may admit (a table of 20 at most). */
export const MAX_TICKET_ADMITS = 20;

/** Group prices an event may offer. */
export const MAX_GROUP_DISCOUNT_TIERS = 3;

export const MIN_GROUP_TICKETS = 2;
export const MAX_GROUP_TICKETS = 500;
export const MAX_GROUP_PERCENT = 90;

/** The feature flag that lets an organizer set either (staff switch it). */
export const GROUP_PRICING_FLAG = "tickets.group_pricing";

export type GroupPricingProblem =
  | "admits_range"
  | "free_admits"
  | "too_many_tiers"
  | "tier_range"
  | "tier_duplicate"
  | "tier_not_better"
  | "free_event_tiers"
  | "not_enabled";

export function admitsProblem(
  admits: number | null | undefined,
  isFreeTier = false,
): GroupPricingProblem | null {
  if (admits === null || admits === undefined) return null;
  if (!Number.isInteger(admits) || admits < 1 || admits > MAX_TICKET_ADMITS) {
    return "admits_range";
  }
  if (isFreeTier && admits !== 1) return "free_admits";
  return null;
}

/**
 * Up to three tiers, each for at least 2 tickets and 1–90% off, and a
 * bigger group never gets a smaller discount.
 */
export function groupDiscountTiersProblem(
  tiers: readonly GroupDiscountTier[] | null | undefined,
): GroupPricingProblem | null {
  const list = tiers ?? [];
  if (list.length > MAX_GROUP_DISCOUNT_TIERS) return "too_many_tiers";
  for (const tier of list) {
    if (
      !Number.isInteger(tier.minTickets) ||
      tier.minTickets < MIN_GROUP_TICKETS ||
      tier.minTickets > MAX_GROUP_TICKETS ||
      !Number.isInteger(tier.percentOff) ||
      tier.percentOff < 1 ||
      tier.percentOff > MAX_GROUP_PERCENT
    ) {
      return "tier_range";
    }
  }
  const sorted = [...list].sort((a, b) => a.minTickets - b.minTickets);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].minTickets === sorted[i - 1].minTickets) {
      return "tier_duplicate";
    }
    if (sorted[i].percentOff <= sorted[i - 1].percentOff) {
      return "tier_not_better";
    }
  }
  return null;
}

/** Tiers in the order they apply (smallest group first). */
export function sortGroupDiscountTiers(
  tiers: readonly GroupDiscountTier[] | null | undefined,
): GroupDiscountTier[] {
  return [...(tiers ?? [])].sort((a, b) => a.minTickets - b.minTickets);
}

export function groupPricingProblemMessage(
  t: CoreTranslator,
  problem: GroupPricingProblem,
): string {
  switch (problem) {
    case "admits_range":
      return t("groupPricing.admitsRange", { max: MAX_TICKET_ADMITS });
    case "free_admits":
      return t("groupPricing.freeAdmits");
    case "too_many_tiers":
      return t("groupPricing.tooManyTiers", { max: MAX_GROUP_DISCOUNT_TIERS });
    case "tier_range":
      return t("groupPricing.tierRange", {
        min: MIN_GROUP_TICKETS,
        max: MAX_GROUP_TICKETS,
        maxPercent: MAX_GROUP_PERCENT,
      });
    case "tier_duplicate":
      return t("groupPricing.tierDuplicate");
    case "tier_not_better":
      return t("groupPricing.tierNotBetter");
    case "free_event_tiers":
      return t("groupPricing.freeEventTiers");
    case "not_enabled":
      return t("groupPricing.notEnabled");
  }
}
