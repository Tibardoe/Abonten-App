// Who may set up group tickets and group prices
// (docs/architecture/group-tickets-and-prices.md): the organizer accounts
// the feature flag tickets.group_pricing is on for. Staff switch it in
// Admin › Markets › Feature flags, naming the organizer's account (or
// team) id in allowSubjects. Checked when a listing is created or its
// tickets or group prices are edited; a listing already set up keeps
// selling either way.

import type { GroupDiscountTier } from "@abonten/core/checkoutPricing";
import {
  GROUP_PRICING_FLAG,
  type GroupPricingProblem,
  admitsProblem,
  groupDiscountTiersProblem,
} from "@abonten/core/groupPricing";
import { isFeatureEnabled } from "../flags/featureFlagCore";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

export async function groupPricingEnabledFor(
  accountId: string,
): Promise<boolean> {
  return isFeatureEnabled(GROUP_PRICING_FLAG, { subjectId: accountId });
}

/**
 * Why these ticket types and group prices cannot be saved for `accountId`,
 * or null. Ordinary tickets (admits 1) and no group prices need nothing.
 */
export async function groupPricingProblem(
  accountId: string,
  input: {
    freeEvent: boolean;
    tiers: readonly { admits?: number | null }[];
    groupDiscounts?: readonly GroupDiscountTier[] | null;
  },
): Promise<GroupPricingProblem | null> {
  for (const tier of input.tiers) {
    const problem = admitsProblem(tier.admits ?? 1, input.freeEvent);
    if (problem) return problem;
  }
  const discounts = input.groupDiscounts ?? [];
  if (discounts.length > 0 && input.freeEvent) return "free_event_tiers";
  const tierProblem = groupDiscountTiersProblem(discounts);
  if (tierProblem) return tierProblem;

  const usesGroups =
    discounts.length > 0 || input.tiers.some((t) => (t.admits ?? 1) > 1);
  if (usesGroups && !(await groupPricingEnabledFor(accountId))) {
    return "not_enabled";
  }
  return null;
}

/**
 * Replaces an event's group prices with `tiers` (none = remove them all).
 * Service role: clients cannot write event_group_discount. The caller has
 * checked the organizer and the tiers. Returns an error text, or null.
 */
export async function replaceEventGroupDiscounts(
  eventId: string,
  tiers: readonly GroupDiscountTier[],
): Promise<string | null> {
  const service = getSupabaseServiceClient();
  const { error: deleteError } = await service
    .from("event_group_discount")
    .delete()
    .eq("event_id", eventId);
  if (deleteError) return deleteError.message;
  if (tiers.length === 0) return null;
  const { error: insertError } = await service
    .from("event_group_discount")
    .insert(
      tiers.map((tier) => ({
        event_id: eventId,
        min_tickets: tier.minTickets,
        percent_off: tier.percentOff,
      })),
    );
  return insertError ? insertError.message : null;
}

/** An event's group prices, smallest group first. */
export async function readEventGroupDiscounts(
  eventId: string,
): Promise<GroupDiscountTier[] | "error"> {
  const { data, error } = await getSupabaseServiceClient()
    .from("event_group_discount")
    .select("min_tickets, percent_off")
    .eq("event_id", eventId)
    .order("min_tickets", { ascending: true });
  if (error) return "error";
  return (data ?? []).map((row) => ({
    minTickets: row.min_tickets,
    percentOff: row.percent_off,
  }));
}
