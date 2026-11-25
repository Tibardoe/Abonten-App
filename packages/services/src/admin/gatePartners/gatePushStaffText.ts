// What the gate partner sender records for staff (incidents, the error on a
// stuck sale in Admin › Gate partners). English by design: the admin
// console is English, and no buyer or organizer reads these.

export const GATE_INCIDENT_TITLE = "Gate partner sales need a person";

export const gateStaffText = {
  refusedIncident: (p: {
    pushId: string;
    checkoutId: string;
    eventId: string;
    code: string;
    detail: string;
  }) =>
    `The partner refused sale ${p.pushId} (checkout line ${p.checkoutId}, event ${p.eventId}): ${p.code} ${p.detail}. The buyer paid; fix the link or refund them, then retry from Admin › Gate partners.`,
  failingIncident: (p: {
    pushId: string;
    eventId: string;
    attempts: number;
    code: string;
    detail: string;
  }) =>
    `Sale ${p.pushId} (event ${p.eventId}) has failed ${p.attempts} times: ${p.code} ${p.detail}. Still retrying; the buyer is waiting for their gate code.`,
  keyUnusable: (envName: string, problem: string) =>
    `The API key in ${envName} cannot be used here (${problem}).`,
  notMapped: "This ticket type has no partner product.",
  buyerDetails: "The buyer has no email or name to register the sale with.",
  buyerIncident: (pushId: string, eventId: string) =>
    `Sale ${pushId} (event ${eventId}) cannot be registered: the buyer has no email or name on their account.`,
  attendeeCount: (registered: number, tickets: number) =>
    `The partner registered ${registered} attendees for ${tickets} tickets.`,
  attendeeCountIncident: (p: {
    orderId: string;
    pushId: string;
    registered: number;
    tickets: number;
  }) =>
    `Partner order ${p.orderId} for sale ${p.pushId} has ${p.registered} attendees, not ${p.tickets}. Check it in the partner's dashboard.`,
  noTickets: "The registered sale has no tickets recorded.",
  codesSoFar: (codes: number, tickets: number) =>
    `${codes} of ${tickets} codes issued so far.`,
  codesPendingIncident: (p: {
    orderId: string;
    pushId: string;
    codes: number;
    tickets: number;
    attempts: number;
  }) =>
    `Partner order ${p.orderId} for sale ${p.pushId} still has ${p.codes} of ${p.tickets} ticket codes after ${p.attempts} looks.`,
  qrUpload: "The QR image of a partner code could not be stored.",
};
