// Pay small small: paying for a ticket in parts before the event.
// Mirrors supabase/migrations/20261025100000_ticket_plans.sql; the design is
// docs/architecture/ticket-plans.md. Amounts are minor units of `currency`.

export type TicketPlanAudience = "staff" | "beta" | "all";

/**
 * awaiting_payment → active → settling → completed, or it ends:
 * expired (the first part never came), lapsed (the deadline passed),
 * cancelled (the buyer, the event, a closed account or staff).
 */
export type TicketPlanStatus =
  | "awaiting_payment"
  | "active"
  | "settling"
  | "completed"
  | "expired"
  | "lapsed"
  | "cancelled";

export type TicketPlanEndReason =
  | "hold_expired"
  | "deadline"
  | "buyer"
  | "event_cancelled"
  | "account_closed"
  | "admin";

export type TicketPlanRefundStatus = "none" | "pending" | "refunded" | "failed";

export type TicketPlanPartRefundStatus =
  | "none"
  | "planned"
  | "requesting"
  | "requested"
  | "processed"
  | "failed";

/** The plan rules staff set in Admin (ticket_plan_program_setting). */
export type TicketPlanRules = {
  firstPartMinBps: number;
  partMinBps: number;
  deadlineHoursBeforeStart: number;
  minDaysToDeadline: number;
  holdMinutes: number;
  maxTicketsPerPlan: number;
  keepFeeOnRefund: boolean;
  reminderDays: number[];
};

/** What the signed-in person may do. Fails closed. */
export type TicketPlanProgram = {
  /** May start a plan, and organizers may offer them. */
  enabled: boolean;
  rules: TicketPlanRules;
};

/** What the site's header asks (the Balance link). */
export type TicketPlanNav = { enabled: boolean; openPlans: number };

export const DISABLED_TICKET_PLAN_NAV: TicketPlanNav = {
  enabled: false,
  openPlans: 0,
};

/**
 * Whether this event can be paid small small for this buyer right now, and
 * on what terms. `reason` says why not, as a code the screens word.
 */
export type TicketPlanOffer =
  | {
      available: true;
      eventId: string;
      occurrenceId: string | null;
      /** When paying must be finished (ISO). */
      deadlineAt: string;
      eventStartsAt: string;
      timezone: string | null;
      currency: string;
      serviceFeeBps: number;
      firstPartMinBps: number;
      partMinBps: number;
      maxTickets: number;
      keepFeeOnRefund: boolean;
      holdMinutes: number;
    }
  | {
      available: false;
      reason:
        | "programme_off"
        | "not_offered"
        | "free_event"
        | "too_soon"
        | "not_on_sale"
        | "own_event"
        | "already_open";
      /** The buyer's open plan for this event, when reason is already_open. */
      planId?: string | null;
    };

export type TicketPlanLine = {
  ticketTypeId: string;
  ticketTypeName: string | null;
  tier: string | null;
  quantity: number;
  unitPriceMinor: number;
  amountMinor: number;
};

export type TicketPlanPart = {
  id: string;
  amountMinor: number;
  method: string | null;
  paidAt: string;
  refundMinor: number;
  refundStatus: TicketPlanPartRefundStatus;
};

/** One plan as its owner sees it. */
export type TicketPlanSummary = {
  id: string;
  status: TicketPlanStatus;
  eventId: string;
  eventTitle: string;
  eventCode: string | null;
  eventFlyerPublicId: string | null;
  eventFlyerVersion: string | null;
  eventStartsAt: string;
  timezone: string | null;
  currency: string;
  totalMinor: number;
  paidMinor: number;
  deadlineAt: string;
  ticketCount: number;
  refundStatus: TicketPlanRefundStatus;
  refundMinor: number;
  createdAt: string;
};

export type TicketPlanDetail = TicketPlanSummary & {
  occurrenceId: string | null;
  ticketMinor: number;
  feeMinor: number;
  taxMinor: number;
  firstPartMinMinor: number;
  partMinMinor: number;
  keepFeeOnRefund: boolean;
  holdExpiresAt: string;
  endedReason: TicketPlanEndReason | null;
  endedAt: string | null;
  completedAt: string | null;
  keptMinor: number;
  lines: TicketPlanLine[];
  parts: TicketPlanPart[];
  /** What a part may be right now; null when nothing can be paid. */
  nextPart: { minMinor: number; maxMinor: number } | null;
  /** A part charge still waiting for the provider (MoMo approval). */
  pendingAttemptId: string | null;
  /** What comes back if the plan ends now. */
  refundIfEnded: { refundMinor: number; keptMinor: number };
  /** Tickets issued for this plan (completed plans). */
  ticketIds: string[];
};

/** Abonten Credit as the Balance screen shows it (rewards visible only). */
export type BalanceCredit = {
  availableMinor: number;
  pendingMinor: number;
  currency: string;
};

/**
 * The Balance screen: money put towards tickets (per currency) and, for
 * people who can see Rewards, Abonten Credit. Two ledgers, shown side by
 * side, never added together.
 */
export type BalanceOverview = {
  plansEnabled: boolean;
  savedTowardsTickets: { currency: string; amountMinor: number }[];
  plans: TicketPlanSummary[];
  credit: BalanceCredit | null;
};

/** The organizer's switch for one event, and what plans hold on it. */
export type EventTicketPlanSetting = {
  /** The organizer may offer plans (the programme lets them in). */
  available: boolean;
  enabled: boolean;
  openPlans: number;
  ticketsHeld: number;
  completedPlans: number;
  paidTowards: { currency: string; amountMinor: number }[];
};

export type TicketPlanAdminSettings = TicketPlanRules & {
  enabled: boolean;
  audience: TicketPlanAudience;
  betaUserIds: string[];
  updatedAt: string;
  updatedBy: string | null;
};

// ── Admin ───────────────────────────────────────────────────────────

export type TicketPlanAdminRow = {
  id: string;
  userId: string;
  username: string | null;
  displayName: string | null;
  eventId: string;
  eventTitle: string;
  status: TicketPlanStatus;
  currency: string;
  totalMinor: number;
  paidMinor: number;
  refundStatus: TicketPlanRefundStatus;
  refundMinor: number;
  keptMinor: number;
  endedReason: TicketPlanEndReason | null;
  deadlineAt: string;
  createdAt: string;
};

export type TicketPlanAdminPart = {
  id: string;
  amountMinor: number;
  provider: string;
  providerReference: string;
  method: string | null;
  providerFeeMinor: number | null;
  paidAt: string;
  refundMinor: number;
  refundStatus: TicketPlanPartRefundStatus;
  refundAttempts: number;
  refundRequestedAt: string | null;
  refundProcessedAt: string | null;
  refundFailure: string | null;
};

export type TicketPlanAdminDetail = TicketPlanAdminRow & {
  occurrenceId: string | null;
  ticketMinor: number;
  feeMinor: number;
  taxMinor: number;
  keepFeeOnRefund: boolean;
  holdExpiresAt: string;
  eventStartsAt: string;
  endedAt: string | null;
  completedAt: string | null;
  transactionId: string | null;
  settlementStatus: string | null;
  lines: TicketPlanLine[];
  parts: TicketPlanAdminPart[];
};

/** Money Pay small small holds or kept, per currency. */
export type TicketPlanAdminTotals = {
  currency: string;
  /** Paid on plans still running: the buyers' money, not yet a sale. */
  heldMinor: number;
  /** Kept as the service-fee share of plans that ended unfinished. */
  keptMinor: number;
  /** Refunds asked for or waiting on the provider. */
  refundingMinor: number;
}[];
