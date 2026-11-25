// Staff words for gate partner links (the admin console is English by
// design). The rules themselves return codes:
// @abonten/core/gatePartners/gateLinkRules.

import {
  GATE_PARTNER_NAMES,
  type GateEnvField,
  type GateEventProblem,
  type GateKeyProblem,
  type GateMappingProblem,
  type GateMappingWarning,
  type GatePartnerProvider,
} from "../gatePartners/gateLinkRules";

export const GATE_EVENT_PROBLEM_TEXT: Record<GateEventProblem, string> = {
  not_found: "The event was not found.",
  not_published: "The event is not published.",
  postponed: "The event is postponed.",
  seated:
    "The event has assigned seats (the partner's order cannot carry a seat).",
  multi_date:
    "The event has several dates (link each show of a run as its own event).",
  no_tickets: "The event has no ticket types.",
  open_amount: "A ticket type lets the buyer choose the amount.",
  group_ticket: "A ticket type admits several people.",
  pass: "A ticket type is a pass for several shows.",
  group_prices: "The event has group prices.",
  free_ticket:
    "A ticket type is free (free registrations are not sent to partners).",
  has_sales: "Tickets were already reserved or sold on Abonten.",
};

export const GATE_KEY_PROBLEM_TEXT: Record<GateKeyProblem, string> = {
  missing: "The API key variable is not set on this deployment.",
  unknown: "The API key is not a pk_live_ or pk_sandbox_ key.",
  live_off_production:
    "Live gate keys are not allowed on a preview or development deployment.",
  sandbox_with_live_payments:
    "A sandbox gate key while payments are live would register real sales in the partner's sandbox.",
  live_with_test_payments:
    "A live gate key while payments are in test mode would register test sales at the real gate.",
};

export function gateEnvNameText(
  provider: GatePartnerProvider,
  field: GateEnvField,
  name: string,
): string {
  const example =
    field === "apiKey" ? "HAPNIIN_API_KEY_GJHF" : "HAPNIIN_WEBHOOK_SECRET";
  const what = field === "apiKey" ? "API key" : "webhook secret";
  return `${name || "(empty)"} is not a ${GATE_PARTNER_NAMES[provider]} ${what} variable (for example ${example}).`;
}

export function gateMappingProblemText(
  problem: GateMappingProblem,
  typeName: (ticketTypeId: string) => string,
  money: (minor: number) => string,
): string {
  switch (problem.code) {
    case "partner_event_missing":
      return "The partner's catalog has no live, unseated event with that id.";
    case "currency":
      return `The partner sells in ${problem.partner}; this event sells in ${problem.abonten}.`;
    case "unmapped":
      return `${typeName(problem.ticketTypeId)} has no partner product.`;
    case "unknown_ticket_type":
      return "A mapped ticket type is not one of this event's.";
    case "duplicate_ticket_type":
      return `${typeName(problem.ticketTypeId)} is mapped twice.`;
    case "duplicate_product":
      return `Partner product ${problem.partnerProductId} is mapped to two ticket types.`;
    case "product_missing":
      return `${typeName(problem.ticketTypeId)}: partner product ${problem.partnerProductId} is not in the partner's event.`;
    case "not_a_ticket":
      return `${typeName(problem.ticketTypeId)}: partner product ${problem.partnerProductId} is not a ticket.`;
    case "price":
      return `${typeName(problem.ticketTypeId)} costs ${money(problem.abontenMinor)} on Abonten but ${money(problem.partnerMinor)} on the partner.`;
  }
}

export function gateMappingWarningText(warning: GateMappingWarning): string {
  switch (warning.code) {
    case "date":
      return `The partner's event starts ${warning.partnerStart}, more than a day from Abonten's ${warning.abontenStart}. Check it is the same event.`;
    case "unmapped_partner_ticket":
      return `Partner ticket ${warning.partnerProductId} is not sold on Abonten.`;
  }
}

/** Plain words for a push's state on the admin pages. */
export const GATE_PUSH_STATUS_TEXT: Record<string, string> = {
  queued: "Waiting to send",
  sending: "Sending",
  ordered: "Registered, codes pending",
  done: "Codes received",
  failed: "Needs staff",
  cancelled: "Not sent (tickets cancelled first)",
};

export const GATE_TICKET_STATE_TEXT: Record<string, string> = {
  issued: "Valid",
  to_void: "To void in the partner's system",
  voided: "Voided",
};
