// The three ways an event can be ticketed, as the codes the event forms keep
// in state, drafts store, and postEvent / updateEventTicketTypes read.
//
// They are codes, not labels: TicketType words them through the catalog.
// Their values are the English labels this app once kept in state, so a
// draft saved before this file existed still restores. Compare and send
// THESE — when the forms compared against translated labels instead, an
// organiser reading French posted "Gratuit", the server asked whether it
// was "Free", and a free event could not be created.

export const TICKET_MODE = {
  free: "Free",
  single: "Single Ticket Type",
  multiple: "Multiple Ticket Types",
} as const;

export type TicketMode = (typeof TICKET_MODE)[keyof typeof TICKET_MODE];
