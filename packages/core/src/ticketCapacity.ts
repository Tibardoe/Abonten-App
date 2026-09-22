// How an event's capacity and its ticket-type quantities fit together,
// decided once for every client form and every server write path. The
// database enforces the same rule (migration
// 20260922120000_event_capacity_and_free_event_promo_guards.sql), so this is
// the friendly, early copy of a hard constraint — never the only one.
//
// Vocabulary:
//   capacity  — the headcount cap for the whole event (`event.capacity`).
//               Unset means unlimited.
//   quantity  — the stock of ONE ticket type (`ticket_type.quantity`). Unset
//               (null) means that type has no stock limit of its own.
//
// Rules:
//   1. No capacity: quantities may be anything — set, unset, or mixed.
//   2. Capacity set: the quantities that ARE set must not add up to more
//      than the capacity. Those seats are reserved for their ticket types.
//   3. Capacity set: ticket types WITHOUT a quantity share whatever the
//      capacity has left over — `capacity - sum(set quantities)`. That pool
//      is drawn down by sales of any of those types together, so several
//      unlimited-looking types can never add up to more than the capacity.
//   4. Every type unset, capacity set: the whole capacity is one shared pool.

export type TicketQuantityInput = {
  /** null / undefined = no quantity set for this ticket type. */
  quantity?: number | null;
};

export type TicketCapacityPlan = {
  /** null when the event has no capacity (rule 1). */
  capacity: number | null;
  /** Seats reserved by ticket types that set a quantity. */
  reserved: number;
  /** Ticket types that set no quantity and share the remaining seats. */
  sharedTypeCount: number;
  /**
   * Seats left for the ticket types without a quantity, or null when the
   * event has no capacity. Negative means the set quantities already exceed
   * the capacity (rule 2 broken).
   */
  sharedPool: number | null;
};

function isSetQuantity(q: number | null | undefined): q is number {
  return typeof q === "number" && Number.isFinite(q);
}

/** The numbers behind the rules, for hints and messages. */
export function planTicketCapacity(
  capacity: number | null | undefined,
  ticketTypes: readonly TicketQuantityInput[],
): TicketCapacityPlan {
  const cap =
    typeof capacity === "number" && Number.isFinite(capacity) && capacity > 0
      ? Math.trunc(capacity)
      : null;
  let reserved = 0;
  let sharedTypeCount = 0;
  for (const t of ticketTypes) {
    if (isSetQuantity(t.quantity))
      reserved += Math.max(0, Math.trunc(t.quantity));
    else sharedTypeCount += 1;
  }
  return {
    capacity: cap,
    reserved,
    sharedTypeCount,
    sharedPool: cap === null ? null : cap - reserved,
  };
}

/**
 * Why this capacity / quantity combination cannot be saved, or null when it
 * can. The one message every form and every server write path shows.
 */
export function ticketCapacityProblem(
  capacity: number | null | undefined,
  ticketTypes: readonly TicketQuantityInput[],
): string | null {
  const plan = planTicketCapacity(capacity, ticketTypes);
  if (plan.capacity === null || plan.reserved <= plan.capacity) return null;
  return `Ticket quantities total ${plan.reserved}, which exceeds the event capacity of ${plan.capacity}.`;
}

/**
 * A one-line explanation of how the seats are split, for the ticket form.
 * Null when there is nothing worth saying (no capacity, or nothing set).
 */
export function ticketCapacityHint(
  capacity: number | null | undefined,
  ticketTypes: readonly TicketQuantityInput[],
): string | null {
  const plan = planTicketCapacity(capacity, ticketTypes);
  if (plan.capacity === null || ticketTypes.length === 0) return null;
  if (plan.reserved > plan.capacity) return null; // the problem message covers it
  const seats = (n: number) => `${n} ${n === 1 ? "seat" : "seats"}`;
  if (plan.reserved === 0) {
    return `All ${seats(plan.capacity)} are shared across your ticket types.`;
  }
  if (plan.sharedTypeCount === 0) {
    const left = plan.capacity - plan.reserved;
    return left === 0
      ? `Ticket quantities use all ${seats(plan.capacity)}.`
      : `Ticket quantities use ${plan.reserved} of ${seats(plan.capacity)}; ${left} will stay unsold unless you raise a quantity.`;
  }
  return `${seats(plan.reserved)} reserved by the quantities you set; the remaining ${seats(plan.sharedPool ?? 0)} are shared by the ${plan.sharedTypeCount === 1 ? "type" : `${plan.sharedTypeCount} types`} without a quantity.`;
}
