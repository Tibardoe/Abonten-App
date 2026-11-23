// Who may sell ticket types whose amount the buyer chooses
// (docs/architecture/open-amount-tickets.md): the organizer accounts the
// feature flag tickets.open_amount is on for. Staff switch it in Admin ›
// Markets › Feature flags, naming the organizer's account (or team) id in
// allowSubjects — exactly like tickets.group_pricing. Checked when a listing
// is created or its tickets are edited; a listing already set up keeps
// selling either way.

import {
  OPEN_AMOUNT_FLAG,
  type OpenAmountTypeProblem,
  type TicketAmountMode,
  openAmountTypeProblem,
} from "@abonten/core/openAmountTickets";
import { isFeatureEnabled } from "../flags/featureFlagCore";

export async function openAmountEnabledFor(
  accountId: string,
): Promise<boolean> {
  return isFeatureEnabled(OPEN_AMOUNT_FLAG, { subjectId: accountId });
}

/** How a ticket type the organizer sends is priced (all optional). */
export type OpenAmountTierInput = {
  amountMode?: TicketAmountMode | string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  amountStep?: number | null;
  admits?: number | null;
};

/**
 * Why these ticket types cannot be saved for `accountId`, or null. Fixed
 * types need nothing; an open type must be valid and the flag on.
 */
export async function openAmountTicketsProblem(
  accountId: string,
  input: {
    freeEvent: boolean;
    currency: string;
    tiers: readonly OpenAmountTierInput[];
  },
): Promise<OpenAmountTypeProblem | null> {
  const open = input.tiers.filter(
    (tier) => (tier.amountMode ?? "fixed") === "open",
  );
  for (const tier of input.tiers) {
    const mode = tier.amountMode ?? "fixed";
    if (mode !== "fixed" && mode !== "open") return "range_missing";
  }
  if (open.length === 0) return null;
  for (const tier of open) {
    const problem = openAmountTypeProblem(tier, {
      currency: input.currency,
      freeEvent: input.freeEvent,
    });
    if (problem) return problem;
  }
  if (!(await openAmountEnabledFor(accountId))) return "not_enabled";
  return null;
}

/**
 * The columns an editor's tier is stored with. An open type's price is its
 * minimum ("From GH₵X" everywhere a price is shown) and it admits one
 * person; a fixed type has no range.
 */
export function openAmountColumns(tier: OpenAmountTierInput): {
  amount_mode: TicketAmountMode;
  min_amount: number | null;
  max_amount: number | null;
  amount_step: number | null;
} {
  if ((tier.amountMode ?? "fixed") !== "open") {
    return {
      amount_mode: "fixed",
      min_amount: null,
      max_amount: null,
      amount_step: null,
    };
  }
  return {
    amount_mode: "open",
    min_amount: tier.minAmount ?? null,
    max_amount: tier.maxAmount ?? null,
    amount_step: tier.amountStep ?? null,
  };
}
