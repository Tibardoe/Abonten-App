import type {
  TicketPlanRules,
  TicketPlanStatus,
} from "@abonten/types/ticketPlanType";

// The rules of Pay small small that both the services and the screens use,
// so what a screen offers is exactly what the server accepts. Amounts are
// integer minor units; nothing here rounds money through a float. The SQL
// in supabase/migrations/20261025100000_ticket_plans.sql applies the same
// refund split (ticket_plan_release) and is kept in step with
// unfinishedRefund below.

export const DEFAULT_TICKET_PLAN_RULES: TicketPlanRules = {
  firstPartMinBps: 2000,
  partMinBps: 1000,
  deadlineHoursBeforeStart: 48,
  minDaysToDeadline: 3,
  holdMinutes: 30,
  maxTicketsPerPlan: 4,
  keepFeeOnRefund: true,
  reminderDays: [7, 2],
};

export const OPEN_PLAN_STATUSES: readonly TicketPlanStatus[] = [
  "awaiting_payment",
  "active",
  "settling",
];

export const ENDED_PLAN_STATUSES: readonly TicketPlanStatus[] = [
  "expired",
  "lapsed",
  "cancelled",
];

/** A part can be paid only while the plan waits for its first or next one. */
export function planTakesPayments(status: TicketPlanStatus): boolean {
  return status === "awaiting_payment" || status === "active";
}

export function isPlanOpen(status: TicketPlanStatus): boolean {
  return OPEN_PLAN_STATUSES.includes(status);
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** When paying must be finished for a date that starts at `startsAt`. */
export function planDeadline(startsAt: Date, rules: TicketPlanRules): Date {
  return new Date(
    startsAt.getTime() - rules.deadlineHoursBeforeStart * HOUR_MS,
  );
}

/**
 * Can a plan start now for a date starting at `startsAt`? Only while its
 * deadline is at least `minDaysToDeadline` away: a plan that must be
 * finished tomorrow is a normal purchase with extra steps.
 */
export function planOfferWindow(
  startsAt: Date,
  rules: TicketPlanRules,
  now: number = Date.now(),
): { ok: true; deadline: Date } | { ok: false; reason: "too_soon" } {
  const deadline = planDeadline(startsAt, rules);
  if (deadline.getTime() - now < rules.minDaysToDeadline * DAY_MS) {
    return { ok: false, reason: "too_soon" };
  }
  return { ok: true, deadline };
}

/** A share of `totalMinor` in basis points, rounded UP to a whole minor unit. */
function shareUp(totalMinor: number, bps: number): number {
  // BigInt: a large total times the basis points can pass 2^53.
  return Number(
    (BigInt(totalMinor) * BigInt(bps) + BigInt(9_999)) / BigInt(10_000),
  );
}

/** The first part and every later part may not be smaller than these. */
export function planMinimums(
  totalMinor: number,
  rules: Pick<TicketPlanRules, "firstPartMinBps" | "partMinBps">,
): { firstPartMinMinor: number; partMinMinor: number } {
  const first = Math.min(
    totalMinor,
    Math.max(1, shareUp(totalMinor, rules.firstPartMinBps)),
  );
  const part = Math.min(
    first,
    Math.max(1, shareUp(totalMinor, rules.partMinBps)),
  );
  return { firstPartMinMinor: first, partMinMinor: part };
}

export type PlanAmounts = {
  status: TicketPlanStatus;
  totalMinor: number;
  paidMinor: number;
  firstPartMinMinor: number;
  partMinMinor: number;
};

/**
 * What the next part may be: at least the minimum (the first part's for a
 * plan with nothing paid), at most what is left, and the last part may be
 * whatever is left. Null when the plan takes no payment now.
 */
export function partBounds(
  plan: PlanAmounts,
): { minMinor: number; maxMinor: number } | null {
  if (!planTakesPayments(plan.status)) return null;
  const remaining = plan.totalMinor - plan.paidMinor;
  if (remaining <= 0) return null;
  const minimum =
    plan.paidMinor === 0 ? plan.firstPartMinMinor : plan.partMinMinor;
  return { minMinor: Math.min(minimum, remaining), maxMinor: remaining };
}

export type PartAmountProblem =
  | "not_payable"
  | "invalid"
  | "below_minimum"
  | "above_remaining";

export function checkPartAmount(
  plan: PlanAmounts,
  amountMinor: number,
): { ok: true } | { ok: false; problem: PartAmountProblem } {
  const bounds = partBounds(plan);
  if (!bounds) return { ok: false, problem: "not_payable" };
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    return { ok: false, problem: "invalid" };
  }
  if (amountMinor < bounds.minMinor) {
    return { ok: false, problem: "below_minimum" };
  }
  if (amountMinor > bounds.maxMinor) {
    return { ok: false, problem: "above_remaining" };
  }
  return { ok: true };
}

/**
 * What goes back if an unfinished plan ends now: everything paid, or — when
 * the plan's terms keep the service fee, as every refund on Abonten does —
 * the ticket share of what was paid (rounded down; the pesewa left over
 * stays with the fee). Same arithmetic as ticket_plan_release.
 */
export function unfinishedRefund(plan: {
  paidMinor: number;
  ticketMinor: number;
  totalMinor: number;
  keepFeeOnRefund: boolean;
}): { refundMinor: number; keptMinor: number } {
  if (plan.paidMinor <= 0 || plan.totalMinor <= 0) {
    return { refundMinor: 0, keptMinor: 0 };
  }
  const refund = plan.keepFeeOnRefund
    ? Number(
        (BigInt(plan.paidMinor) * BigInt(plan.ticketMinor)) /
          BigInt(plan.totalMinor),
      )
    : plan.paidMinor;
  return { refundMinor: refund, keptMinor: plan.paidMinor - refund };
}

/**
 * Amounts to offer as one-tap choices: the minimum, about half of what is
 * left (in whole currency units), and everything left. Sorted, distinct,
 * all inside the bounds.
 */
export function suggestedPartAmounts(
  bounds: { minMinor: number; maxMinor: number },
  minorFactor: number,
): number[] {
  const unit = Math.max(1, minorFactor);
  const half = Math.ceil(bounds.maxMinor / 2 / unit) * unit;
  const minimum = Math.ceil(bounds.minMinor / unit) * unit;
  const choices = [minimum, half, bounds.maxMinor, bounds.minMinor]
    .filter((v) => v >= bounds.minMinor && v <= bounds.maxMinor)
    .sort((a, b) => a - b);
  return [...new Set(choices)].slice(-3);
}

/**
 * Which reminder to send now, if any: the closest one that is due and not
 * yet sent. Any earlier ones that were missed (the job was down) are marked
 * sent with it, so a person never gets two at once.
 */
export function dueReminder(
  deadline: Date,
  reminderDays: readonly number[],
  sent: readonly number[],
  now: number = Date.now(),
): { send: number; markSent: number[] } | null {
  if (deadline.getTime() <= now) return null;
  const due = reminderDays
    .filter((d) => !sent.includes(d))
    .filter((d) => deadline.getTime() - d * DAY_MS <= now)
    .sort((a, b) => a - b);
  if (due.length === 0) return null;
  return { send: due[0], markSent: due };
}

/** Whole days left before the deadline, rounded up (0 once it has passed). */
export function daysUntil(deadline: Date, now: number = Date.now()): number {
  const ms = deadline.getTime() - now;
  return ms <= 0 ? 0 : Math.ceil(ms / DAY_MS);
}

/** Paid so far as a share of the total, 0..1, for a progress bar. */
export function planProgress(plan: {
  paidMinor: number;
  totalMinor: number;
}): number {
  if (plan.totalMinor <= 0) return 0;
  return Math.min(1, Math.max(0, plan.paidMinor / plan.totalMinor));
}
