// Open-amount tickets: a ticket type whose amount the buyer chooses
// (PROJECT.md §92, docs/architecture/open-amount-tickets.md). The organizer
// sets a minimum, a maximum and a step; the buyer types an amount (or taps a
// quick pick) and gets ONE ticket for it, and the door shows "Paid GH₵150"
// so staff load that many ride credits. The same mechanism is "pay what you
// want (minimum X)" entry and a table deposit: the type's one-line note says
// what the amount buys.
//
// The rules here are the services' and every screen's; the database
// re-checks the range (ticket_type CHECKs and trigger) and the chosen amount
// (create_ticket_checkout). All arithmetic is in the currency's minor units
// so 0.1 + 0.2 never decides a price. Reasons are codes; the words come from
// `openAmount.*` of the core namespace, in the reader's language.

import { formatMoney } from "./formatMoney";
import type { CoreTranslator } from "./i18n/translator";
import { isKnownCurrency } from "./money/currencies";
import { formatMajor } from "./money/formatMoney";
import { fromMajor, money, toMajor, tryFromMajor } from "./money/money";
import { ticketTypeLabel } from "./ticketTiers";

/** The feature flag that lets an organizer sell one (staff switch it). */
export const OPEN_AMOUNT_FLAG = "tickets.open_amount";

export type TicketAmountMode = "fixed" | "open";

/** An open type's range, in major units of its currency. */
export type OpenAmountRange = {
  minAmount: number;
  maxAmount: number;
  amountStep: number;
};

/** The amounts a buyer is offered at most as quick picks. */
export const OPEN_AMOUNT_QUICK_PICKS = 4;

/** True when the row (any shape that carries amount_mode) is open. */
export function isOpenAmountType(
  type: { amount_mode?: string | null; amountMode?: string | null } | null,
): boolean {
  return (type?.amount_mode ?? type?.amountMode ?? "fixed") === "open";
}

/**
 * The range of a ticket type row, or null for a fixed type or a row that
 * lacks one (the database never stores an open type without all three).
 */
export function openAmountRangeOf(
  type: {
    amount_mode?: string | null;
    min_amount?: number | string | null;
    max_amount?: number | string | null;
    amount_step?: number | string | null;
  } | null,
): OpenAmountRange | null {
  if (!type || !isOpenAmountType(type)) return null;
  const minAmount = Number(type.min_amount);
  const maxAmount = Number(type.max_amount);
  const amountStep = Number(type.amount_step);
  if (
    !Number.isFinite(minAmount) ||
    !Number.isFinite(maxAmount) ||
    !Number.isFinite(amountStep) ||
    type.min_amount == null ||
    type.max_amount == null ||
    type.amount_step == null
  ) {
    return null;
  }
  return { minAmount, maxAmount, amountStep };
}

// ── The organizer's range ─────────────────────────────────────────────

export type OpenAmountRangeProblem =
  | "range_missing"
  | "min_not_positive"
  | "max_below_min"
  | "step_not_positive"
  | "too_precise"
  | "step_misaligned";

/** Exact minor units of a major amount, or null when it is not one. */
function minorOf(amount: unknown, currency: string): number | null {
  if (typeof amount !== "number" && typeof amount !== "string") return null;
  if (typeof amount === "string" && amount.trim() === "") return null;
  const parsed = tryFromMajor(amount, currency);
  if (!parsed) return null;
  // More decimals than the currency holds: fromMajor rounded them away.
  const asNumber = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(asNumber)) return null;
  return parsed.amountMinor;
}

function hasCurrencyPrecision(amount: number, currency: string): boolean {
  const minor = fromMajor(amount, currency).amountMinor;
  // Compare in major units with a tolerance far below one minor unit.
  return Math.abs(toMajor(money(minor, currency)) - amount) < 1e-9;
}

/**
 * Why an organizer's range cannot be saved, or null when it can. The
 * minimum is above 0, the maximum not below it, the step above 0, every
 * amount within the currency's decimals, and the maximum is the minimum
 * plus whole steps (so the highest amount can actually be chosen).
 */
export function openAmountRangeProblem(
  range: Partial<OpenAmountRange> | null | undefined,
  currency: string,
): OpenAmountRangeProblem | null {
  if (
    !range ||
    range.minAmount == null ||
    range.maxAmount == null ||
    range.amountStep == null ||
    !Number.isFinite(range.minAmount) ||
    !Number.isFinite(range.maxAmount) ||
    !Number.isFinite(range.amountStep)
  ) {
    return "range_missing";
  }
  if (!isKnownCurrency(currency)) return "range_missing";
  if (range.minAmount <= 0) return "min_not_positive";
  if (range.amountStep <= 0) return "step_not_positive";
  if (
    !hasCurrencyPrecision(range.minAmount, currency) ||
    !hasCurrencyPrecision(range.maxAmount, currency) ||
    !hasCurrencyPrecision(range.amountStep, currency)
  ) {
    return "too_precise";
  }
  const min = minorOf(range.minAmount, currency) ?? 0;
  const max = minorOf(range.maxAmount, currency) ?? 0;
  const step = minorOf(range.amountStep, currency) ?? 0;
  if (step <= 0) return "step_not_positive";
  if (max < min) return "max_below_min";
  if ((max - min) % step !== 0) return "step_misaligned";
  return null;
}

function formatAmount(
  amount: number,
  currency: string,
  locale?: string | null,
): string {
  return formatMajor(amount, currency, { trimZeroFraction: true, locale });
}

export function openAmountRangeProblemMessage(
  t: CoreTranslator,
  problem: OpenAmountRangeProblem,
): string {
  switch (problem) {
    case "range_missing":
      return t("openAmount.rangeMissing");
    case "min_not_positive":
      return t("openAmount.minNotPositive");
    case "max_below_min":
      return t("openAmount.maxBelowMin");
    case "step_not_positive":
      return t("openAmount.stepNotPositive");
    case "too_precise":
      return t("openAmount.tooPrecise");
    case "step_misaligned":
      return t("openAmount.stepMisaligned");
  }
}

// ── What an open type may not also be ─────────────────────────────────

export type OpenAmountTypeProblem =
  | OpenAmountRangeProblem
  | "free_event"
  | "admits"
  | "pass"
  | "seating"
  | "not_enabled";

/**
 * Why a ticket type set to "the buyer chooses the amount" cannot be saved
 * as it is (apart from the flag, which the services check), or null.
 * A fixed type needs nothing.
 */
export function openAmountTypeProblem(
  tier: {
    amountMode?: TicketAmountMode | string | null;
    minAmount?: number | null;
    maxAmount?: number | null;
    amountStep?: number | null;
    admits?: number | null;
    passShows?: number | null;
  },
  input: { currency: string; freeEvent: boolean },
): OpenAmountTypeProblem | null {
  if ((tier.amountMode ?? "fixed") !== "open") return null;
  if (input.freeEvent) return "free_event";
  if ((tier.admits ?? 1) !== 1) return "admits";
  if (tier.passShows != null) return "pass";
  return openAmountRangeProblem(
    {
      minAmount: tier.minAmount ?? undefined,
      maxAmount: tier.maxAmount ?? undefined,
      amountStep: tier.amountStep ?? undefined,
    },
    input.currency,
  );
}

export function openAmountTypeProblemMessage(
  t: CoreTranslator,
  problem: OpenAmountTypeProblem,
): string {
  switch (problem) {
    case "free_event":
      return t("openAmount.freeEvent");
    case "admits":
      return t("openAmount.admits");
    case "pass":
      return t("openAmount.pass");
    case "seating":
      return t("openAmount.seating");
    case "not_enabled":
      return t("openAmount.notEnabled");
    default:
      return openAmountRangeProblemMessage(t, problem);
  }
}

// ── The buyer's amount ────────────────────────────────────────────────

export type ChosenAmountProblem =
  | "missing"
  | "below_min"
  | "above_max"
  | "off_step";

/**
 * Why the amount a buyer typed cannot be bought, or null when it can:
 * within the range, on the steps, within the currency's decimals. Accepts a
 * number or the text of an input ("150", "150.5").
 */
export function chosenAmountProblem(
  amount: unknown,
  range: OpenAmountRange,
  currency: string,
): ChosenAmountProblem | null {
  const chosen = minorOf(amount, currency);
  if (chosen === null || chosen <= 0) return "missing";
  const asNumber = typeof amount === "number" ? amount : Number(amount);
  if (!hasCurrencyPrecision(asNumber, currency)) return "off_step";
  const min = fromMajor(range.minAmount, currency).amountMinor;
  const max = fromMajor(range.maxAmount, currency).amountMinor;
  const step = fromMajor(range.amountStep, currency).amountMinor;
  if (chosen < min) return "below_min";
  if (chosen > max) return "above_max";
  if (step > 0 && (chosen - min) % step !== 0) return "off_step";
  return null;
}

/** The typed amount as a number of major units, or null. */
export function parseChosenAmount(
  amount: unknown,
  currency: string,
): number | null {
  const chosen = minorOf(amount, currency);
  if (chosen === null) return null;
  return toMajor(money(chosen, currency));
}

export function chosenAmountProblemMessage(
  t: CoreTranslator,
  problem: ChosenAmountProblem,
  range: OpenAmountRange,
  currency: string,
  locale?: string | null,
): string {
  const min = formatAmount(range.minAmount, currency, locale);
  const max = formatAmount(range.maxAmount, currency, locale);
  const step = formatAmount(range.amountStep, currency, locale);
  switch (problem) {
    case "missing":
      return t("openAmount.chooseAmount", { min, max });
    case "below_min":
      return t("openAmount.belowMin", { min });
    case "above_max":
      return t("openAmount.aboveMax", { max });
    case "off_step":
      return t("openAmount.offStep", { step, min });
  }
}

/** "Choose from GH₵50 to GH₵1,000, in steps of GH₵10." */
export function openAmountRangeHint(
  t: CoreTranslator,
  range: OpenAmountRange,
  currency: string,
  locale?: string | null,
): string {
  const min = formatAmount(range.minAmount, currency, locale);
  const max = formatAmount(range.maxAmount, currency, locale);
  const step = formatAmount(range.amountStep, currency, locale);
  if (range.maxAmount === range.minAmount) {
    return t("openAmount.hintSingle", { min });
  }
  return t("openAmount.hint", { min, max, step });
}

/**
 * An open type's price where one price would stand on its own (an
 * organizer's list of ticket types, Insights): "GH₵20 to GH₵1,000", never
 * the lowest amount alone. One amount when the range holds only one.
 */
export function openAmountRangeLabel(
  t: CoreTranslator,
  range: OpenAmountRange,
  currency: string,
  locale?: string | null,
): string {
  const min = formatAmount(range.minAmount, currency, locale);
  if (range.maxAmount === range.minAmount) return min;
  const max = formatAmount(range.maxAmount, currency, locale);
  return t("openAmount.range", { min, max });
}

/**
 * Whether a checkout offers the promo code entry. A code never applies to
 * an amount the buyer chose (priceOrder, create_ticket_checkout), so the
 * entry is hidden when every line picked is one, or, before anything is
 * picked, when every type on offer is one. One fixed-price line (or type)
 * keeps it.
 */
export function promoCodeEntryShown(
  picked: readonly { open: boolean }[],
  offered: readonly { open: boolean }[] = [],
): boolean {
  const lines = picked.length > 0 ? picked : offered;
  return lines.length === 0 || lines.some((line) => !line.open);
}

/**
 * A few amounts to tap: the minimum, then about 2×, 5× and 10× it, each
 * moved up onto the steps and kept within the maximum, plus the maximum
 * when room is left. Major units, smallest first, no repeats.
 */
export function openAmountQuickPicks(
  range: OpenAmountRange,
  currency: string,
  count = OPEN_AMOUNT_QUICK_PICKS,
): number[] {
  if (openAmountRangeProblem(range, currency)) return [];
  const min = fromMajor(range.minAmount, currency).amountMinor;
  const max = fromMajor(range.maxAmount, currency).amountMinor;
  const step = fromMajor(range.amountStep, currency).amountMinor;
  const onSteps = (target: number) => {
    const steps = Math.ceil((target - min) / step);
    return Math.min(max, min + Math.max(0, steps) * step);
  };
  const picks = new Set<number>([min]);
  for (const factor of [2, 5, 10]) {
    if (picks.size >= count) break;
    const value = onSteps(min * factor);
    if (value <= max) picks.add(value);
  }
  if (picks.size < count) picks.add(max);
  return [...picks]
    .sort((a, b) => a - b)
    .slice(0, count)
    .map((minor) => toMajor(money(minor, currency)));
}

// ── The ticket ────────────────────────────────────────────────────────

/**
 * The amount paid for a ticket whose amount the buyer chose, from its
 * checkout line (`checkout:ticket_checkout_id ( open_amount, unit_price )`
 * in @abonten/core/ticketSelect), or null for any other ticket or when the
 * reader cannot see the line (a ticket someone sent them: the services read
 * it for the holder, heldTicketPaidAmountsCore).
 */
export function openAmountPaidOf(ticket: {
  checkout?: {
    open_amount?: boolean | null;
    unit_price?: number | string | null;
  } | null;
  ticket_type?: { currency?: string | null } | null;
}): { amount: number; currency: string } | null {
  const line = ticket.checkout;
  const currency = ticket.ticket_type?.currency;
  if (!line?.open_amount || line.unit_price == null || !currency) return null;
  const amount = Number(line.unit_price);
  return Number.isFinite(amount) ? { amount, currency } : null;
}

// ── At the door ───────────────────────────────────────────────────────

/** A scanned ticket as checkInTicketCore returns it (`ticket`). */
export type CheckedInTicketLike = {
  type: string | null;
  note: string | null;
  paidAmount: { amount: number; currency: string } | null;
};

/**
 * What the door shows after a ticket is checked in, as the website's
 * check-in and the app's scanner both render it: the amount paid for a
 * ticket whose amount the buyer chose ("Paid GH₵150", in large type, so
 * staff load that many credits), the type's name and its note. Each line
 * is null when there is nothing to show.
 */
export function checkedInTicketLines(
  t: CoreTranslator,
  ticket: CheckedInTicketLike,
  locale?: string | null,
): { paid: string | null; type: string | null; note: string | null } {
  const paid = ticket.paidAmount
    ? t("openAmount.paidAtDoor", {
        amount: formatMoney(
          ticket.paidAmount.currency,
          ticket.paidAmount.amount,
          { locale },
        ),
      })
    : null;
  return {
    paid,
    type: ticket.type ? ticketTypeLabel(t, ticket.type) || null : null,
    note: ticket.note?.trim() ? ticket.note : null,
  };
}
