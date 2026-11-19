// An event's refund policy: until when a buyer may cancel a paid ticket and
// get the ticket price back (the service fee is never refunded). One rule
// for the website, the app, the services and the database guard
// (guard_event_refund_policy, migration 20261119120000): change them
// together.
//
// Whatever the policy, a buyer can't cancel a ticket once its show has
// started: a ticket that wasn't scanned is not a reason to give the money
// back after the curtain went up. The organizer (cancelling the event or
// a ticket) and Abonten's staff are not bound by the policy.

export const REFUND_POLICY_KINDS = [
  "until_start",
  "until_cutoff",
  "none",
] as const;
export type RefundPolicyKind = (typeof REFUND_POLICY_KINDS)[number];

/** The cut-offs an organizer can pick, in hours before the show. */
export const REFUND_CUTOFF_HOURS = [24, 48, 72, 168] as const;
export type RefundCutoffHours = (typeof REFUND_CUTOFF_HOURS)[number];

export type RefundPolicy =
  | { kind: "until_start"; cutoffHours: null }
  | { kind: "until_cutoff"; cutoffHours: RefundCutoffHours }
  | { kind: "none"; cutoffHours: null };

export const DEFAULT_REFUND_POLICY: RefundPolicy = {
  kind: "until_start",
  cutoffHours: null,
};

const HOUR_MS = 60 * 60 * 1000;

export function isRefundPolicyKind(value: unknown): value is RefundPolicyKind {
  return (
    typeof value === "string" &&
    (REFUND_POLICY_KINDS as readonly string[]).includes(value)
  );
}

export function isRefundCutoffHours(
  value: unknown,
): value is RefundCutoffHours {
  return (
    typeof value === "number" &&
    (REFUND_CUTOFF_HOURS as readonly number[]).includes(value)
  );
}

/**
 * A policy from what a form or a request sent, or null when it isn't one
 * (an unknown kind, or a cut-off that isn't on the list).
 */
export function parseRefundPolicy(
  kind: unknown,
  cutoffHours: unknown,
): RefundPolicy | null {
  if (!isRefundPolicyKind(kind)) return null;
  if (kind === "until_cutoff") {
    const hours =
      typeof cutoffHours === "string" ? Number(cutoffHours) : cutoffHours;
    return isRefundCutoffHours(hours) ? { kind, cutoffHours: hours } : null;
  }
  return { kind, cutoffHours: null };
}

/**
 * The policy stored on an event row. A row from before the policy existed,
 * or one that doesn't parse, reads as the default (refunds until the show
 * starts), which is how those events always behaved.
 */
export function refundPolicyOf(event: {
  refund_policy?: string | null;
  refund_cutoff_hours?: number | null;
}): RefundPolicy {
  return (
    parseRefundPolicy(event.refund_policy, event.refund_cutoff_hours) ??
    DEFAULT_REFUND_POLICY
  );
}

/** How long before the show refunds close: 0 = at the start, Infinity = never open. */
export function refundPolicyStrictness(policy: RefundPolicy): number {
  if (policy.kind === "none") return Number.POSITIVE_INFINITY;
  if (policy.kind === "until_cutoff") return policy.cutoffHours;
  return 0;
}

/**
 * Whether moving from `current` to `next` takes something away from people
 * who already hold a ticket. Once an event has confirmed tickets, only a
 * change that is at least as generous is allowed.
 */
export function isStricterRefundPolicy(
  next: RefundPolicy,
  current: RefundPolicy,
): boolean {
  return refundPolicyStrictness(next) > refundPolicyStrictness(current);
}

/**
 * When the ticket's show starts: its own date for a ticket bought for one
 * date of a multi-date event, else the event's start, else (an older ticket
 * with no date of its own) the event's first date.
 */
export function ticketShowStart(input: {
  occurrenceId?: string | null;
  eventStartsAt?: string | Date | null;
  occurrences?: { id?: string; starts_at: string | Date }[] | null;
}): Date | null {
  const occurrences = input.occurrences ?? [];
  const own = input.occurrenceId
    ? occurrences.find((o) => o.id === input.occurrenceId)
    : undefined;
  const candidates = own
    ? [own.starts_at]
    : input.eventStartsAt
      ? [input.eventStartsAt]
      : occurrences.map((o) => o.starts_at);
  const times = candidates
    .map((value) => new Date(value).getTime())
    .filter((time) => !Number.isNaN(time));
  return times.length > 0 ? new Date(Math.min(...times)) : null;
}

/** The last moment a paid ticket can be cancelled for a refund, or null when never. */
export function refundDeadline(
  policy: RefundPolicy,
  showStart: Date | null,
): Date | null {
  if (policy.kind === "none" || !showStart) return null;
  const hours = policy.kind === "until_cutoff" ? policy.cutoffHours : 0;
  return new Date(showStart.getTime() - hours * HOUR_MS);
}

export type BuyerCancelRefusal = "started" | "no_refunds" | "cutoff_passed";

export type BuyerCancelDecision =
  | { allowed: true; deadline: Date | null }
  | { allowed: false; reason: BuyerCancelRefusal; deadline: Date | null };

/**
 * Whether the buyer may cancel this ticket now. A free ticket can be
 * cancelled (giving the seat back) until its show starts; a paid one only
 * as the event's refund policy allows. With no known start, only the
 * "no refunds" policy refuses.
 */
export function buyerCancelDecision(input: {
  policy: RefundPolicy;
  showStart: Date | null;
  paid: boolean;
  now?: Date;
}): BuyerCancelDecision {
  const now = (input.now ?? new Date()).getTime();
  const start = input.showStart;
  if (start && now >= start.getTime()) {
    return { allowed: false, reason: "started", deadline: start };
  }
  if (!input.paid) return { allowed: true, deadline: start };
  if (input.policy.kind === "none") {
    return { allowed: false, reason: "no_refunds", deadline: null };
  }
  const deadline = refundDeadline(input.policy, start);
  if (deadline && now >= deadline.getTime()) {
    return { allowed: false, reason: "cutoff_passed", deadline };
  }
  return { allowed: true, deadline };
}

/**
 * The buyer's cancel decision for a ticket as the ticket screens hold it
 * (TICKET_WITH_EVENT_SELECT): paid when it has a payment. The server makes
 * the same decision from the database (buyerCancelGate); this one only
 * decides what the screen offers.
 */
export function ticketCancelDecision(
  ticket: {
    occurrence_id?: string | null;
    transaction_id?: string | null;
    event: {
      starts_at?: string | Date | null;
      refund_policy?: string | null;
      refund_cutoff_hours?: number | null;
      occurrences?: { id?: string; starts_at: string | Date }[] | null;
    };
  },
  now?: Date,
): BuyerCancelDecision {
  return buyerCancelDecision({
    policy: refundPolicyOf(ticket.event),
    showStart: ticketShowStart({
      occurrenceId: ticket.occurrence_id,
      eventStartsAt: ticket.event.starts_at,
      occurrences: ticket.event.occurrences,
    }),
    paid: !!ticket.transaction_id,
    now,
  });
}

/** The cut-off in whole days, as the forms and the event page say it. */
export function refundCutoffDays(hours: RefundCutoffHours): number {
  return hours / 24;
}

/** The value a form's single select holds for a policy ("until_cutoff:48"). */
export function refundPolicyChoice(policy: RefundPolicy): string {
  return policy.kind === "until_cutoff"
    ? `until_cutoff:${policy.cutoffHours}`
    : policy.kind;
}

/** Every choice a form offers, most generous first. */
export const REFUND_POLICY_CHOICES: readonly RefundPolicy[] = [
  DEFAULT_REFUND_POLICY,
  ...REFUND_CUTOFF_HOURS.map(
    (cutoffHours) => ({ kind: "until_cutoff", cutoffHours }) as RefundPolicy,
  ),
  { kind: "none", cutoffHours: null },
];

/** The policy a form's single select stands for, or null. */
export function refundPolicyFromChoice(choice: string): RefundPolicy | null {
  const [kind, hours] = choice.split(":");
  return parseRefundPolicy(kind, hours === undefined ? null : Number(hours));
}

/**
 * The request fields for a form's choice: none when the form sent none (an
 * edit then keeps the event's policy). A choice that isn't one goes as it
 * is, for the server to refuse.
 */
export function refundPolicyRequestFields(choice: string | null | undefined): {
  refundPolicy?: string;
  refundCutoffHours?: number | null;
} {
  if (!choice) return {};
  const policy = refundPolicyFromChoice(choice);
  if (!policy) return { refundPolicy: choice, refundCutoffHours: null };
  return { refundPolicy: policy.kind, refundCutoffHours: policy.cutoffHours };
}
