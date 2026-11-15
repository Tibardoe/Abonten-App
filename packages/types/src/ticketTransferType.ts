// Send a ticket to a friend (docs/architecture/ticket-transfers.md).
// Shapes shared by @abonten/services, the web Server Actions, the
// /api/mobile/tickets/transfers/** routes and @abonten/api-client.

export type TicketTransferStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "expired";

export type TicketTransferAudience = "staff" | "beta" | "all";

export type TicketTransferProgram = {
  /** May this person send tickets now (programme, audience, kill switch). */
  enabled: boolean;
  maxMoves: number;
  acceptHours: number;
};

/** A person as the other side of an offer sees them: public details only. */
export type TicketTransferPerson = {
  id: string;
  name: string | null;
  username: string | null;
  avatarPublicId: string | null;
  avatarVersion: string | null;
};

/** Why a ticket cannot be sent right now (a code: words come from i18n). */
export type TicketSendBlock =
  | "program_off"
  | "organizer_off"
  | "not_active"
  | "event_over"
  | "too_many_moves"
  | "restricted";

export type OutgoingTicketTransfer = {
  id: string;
  ticketId: string;
  status: TicketTransferStatus;
  /** Set when the offer names an account (it does once accepted). */
  to: TicketTransferPerson | null;
  /** Set when the offer went to a number with no account: masked. */
  toPhoneMasked: string | null;
  /**
   * For an offer to a number with no account: whether the invite text was
   * accepted by the provider. False means the person has to be told some
   * other way. Null for an offer to an account.
   */
  toPhoneTexted: boolean | null;
  createdAt: string;
  expiresAt: string;
};

/** What the ticket screen needs to offer "Send to a friend". */
export type TicketTransferState = {
  canSend: boolean;
  block: TicketSendBlock | null;
  movesLeft: number;
  pending: OutgoingTicketTransfer | null;
};

export type IncomingTicketTransfer = {
  id: string;
  ticketId: string;
  from: TicketTransferPerson;
  ticketType: string | null;
  event: {
    id: string;
    title: string;
    eventCode: string;
    startsAt: string | null;
    endsAt: string | null;
    timezone: string | null;
    flyerPublicId: string | null;
    flyerVersion: string | null;
  };
  createdAt: string;
  expiresAt: string;
};

/**
 * Who a typed name or number points at, shown before sending. A username
 * shows the account's public name and photo; a phone number never says
 * whether it has an account (that would let anyone test numbers).
 */
export type TicketTransferRecipient =
  | { kind: "account"; person: TicketTransferPerson }
  | { kind: "phone"; phoneE164: string; phoneMasked: string };

export type SendTicketTarget =
  | { kind: "username"; username: string }
  | { kind: "phone"; phone: string };

export type TicketTransferAdminSettings = {
  enabled: boolean;
  audience: TicketTransferAudience;
  betaUserIds: string[];
  maxMoves: number;
  acceptHours: number;
  textsPerSenderPerDay: number;
  updatedAt: string;
  updatedBy: string | null;
};
