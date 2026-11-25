// Gate partner connectors (docs/architecture/gate-partner-connectors.md).
// Codes only: the words come from i18n.

/** What an organizer sees about their event's link (read-only). */
export type EventGatePartner =
  | { linked: false }
  | {
      linked: true;
      /** The partner's code ("hapniin"); its name is a brand. */
      provider: string;
      partnerEventId: string;
      partnerEventTitle: string | null;
      /** active: selling; paused: Abonten stopped new sales for now. */
      status: "active" | "paused";
      currency: string;
      products: {
        ticketTypeId: string;
        /** The ticket type's stored name (a code for FREE / SINGLE TICKET). */
        ticketType: string;
        partnerProductId: string;
        partnerProductName: string | null;
        price: number;
      }[];
      /** Tickets whose partner code has arrived. */
      ticketsWithCodes: number;
      /** Sales still being registered with the partner. */
      salesWaiting: number;
      /** Sales Abonten staff are looking at. */
      salesNeedingStaff: number;
      /** Codes to void in the partner's system (cancelled or refunded). */
      toVoid: { ticketId: string; code: string; requestedAt: string }[];
      voided: number;
    };
