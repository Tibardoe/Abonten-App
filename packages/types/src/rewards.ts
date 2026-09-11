// Abonten Rewards (credit) types shared by web, mobile and the admin
// console. Amounts crossing the API are in PESEWAS (`*Minor`, integers) --
// the same unit the credit ledger stores -- and are formatted for display
// with @abonten/core/rewards/creditAmount. One definition per concept; the
// shapes mirror get_my_credit_summary / get_my_credit_activity /
// get_rewards_program_public (migrations 20260910193609 + 20260910193657).

export type CreditAccountStatus = "active" | "frozen" | "closed";

export type CreditSpendScope = "any" | "tickets" | "promotions" | "first_order";

export type CreditLotKind =
  | "reward"
  | "promotion"
  | "welcome"
  | "bonus"
  | "refund"
  | "adjustment";

export type CreditLotStatus =
  | "pending"
  | "active"
  | "exhausted"
  | "expired"
  | "voided"
  | "clawed_back"
  | "forfeited";

export type CreditJournalType =
  | "reward.accrue"
  | "reward.release"
  | "reward.void"
  | "reward.clawback"
  | "bonus.grant"
  | "adjust.credit"
  | "adjust.debit"
  | "redeem.reserve"
  | "redeem.release"
  | "redeem.capture"
  | "redeem.refund"
  | "hold.freeze"
  | "hold.unfreeze"
  | "withdraw.request"
  | "withdraw.complete"
  | "withdraw.fail"
  | "expire"
  | "account.close";

export type CreditSummary = {
  /** Whether the Rewards program is switched on for this user. */
  enabled: boolean;
  currency: "GHS";
  status: CreditAccountStatus;
  availableMinor: number;
  pendingMinor: number;
  /** Reserved for a checkout, frozen or being withdrawn. */
  onHoldMinor: number;
  inDebt: boolean;
  withdrawableMinor: number;
  bySpendScope: Partial<Record<CreditSpendScope, number>>;
  lifetime: {
    earnedMinor: number;
    spentMinor: number;
    withdrawnMinor: number;
    expiredMinor: number;
    reversedMinor: number;
  };
  expiringSoon: { amountMinor: number; expiresAt: string } | null;
  nextRelease: {
    amountMinor: number;
    releaseAt: string;
    label: string | null;
  } | null;
};

/** How a line is shown: its lifecycle state as the user understands it. */
export type CreditActivityState =
  | "pending"
  | "available"
  | "used"
  | "expired"
  | "reversed"
  | "completed";

export type CreditActivityItem = {
  id: string;
  createdAt: string;
  journalType: CreditJournalType;
  /** Signed, from the user's point of view. */
  amountMinor: number;
  title: string;
  subtitle: string | null;
  state: CreditActivityState;
  /** For pending rewards: when they are expected to unlock. */
  releaseAt: string | null;
  /** For credit still available: when it expires. */
  expiresAt: string | null;
  target: {
    kind: "event" | "place" | "ticket" | "promotion";
    id: string;
  } | null;
};

export type RewardsProgram = {
  enabled: boolean;
  eventReferral: {
    rateBps: number;
    minOrderMinor: number;
    expiryDays: number | null;
  } | null;
  friendReferral: {
    referrerMinor: number | null;
    refereeMinor: number | null;
    minOrderMinor: number | null;
    welcomeExpiryDays: number | null;
  } | null;
  organizerRebate: { netShareBps: number; expiryDays: number | null } | null;
  venueRebate: { netShareBps: number; expiryDays: number | null } | null;
  organizerMilestone: {
    amountMinor: number;
    uniqueBuyers: number;
    expiryDays: number | null;
  } | null;
  redemption: {
    tickets: boolean;
    promotions: boolean;
    allowFullCreditTicketOrders: boolean;
    minCashChargeMinor: number;
  };
  withdrawals: { enabled: boolean; minMinor: number };
};

/** Why credit can't be used on an order right now (null when it can). */
export type CreditBlockedReason =
  | "program_off"
  | "redemption_off"
  | "no_credit"
  | "account_frozen"
  | "account_closed"
  | "in_debt"
  | "order_too_small"
  /** Credit can't pay for tickets to an event you organize. */
  | "own_event";

/**
 * What the checkout "Use credit" switch offers for one order. `creditMinor`
 * is exactly what a payment attempt with useCredit=true will reserve.
 */
export type CreditQuote = {
  /** Show the switch at all (the program and this kind of spending are on). */
  offered: boolean;
  blockedReason: CreditBlockedReason | null;
  orderTotalMinor: number;
  spendableMinor: number;
  creditMinor: number;
  cashMinor: number;
  /** Credit covers the whole order: no card or wallet is charged. */
  creditOnly: boolean;
  currency: string;
};

// ─────────────────────────────────────────────────────────────
// Referral links (Phase 4)
// ─────────────────────────────────────────────────────────────

/** The caller's referral code for share links (null while capture is off). */
export type ReferralLink = {
  captureEnabled: boolean;
  code: string | null;
  /** How long after opening a link a purchase still counts. */
  attributionWindowDays: number;
};

/**
 * A referral link the buyer opened, sent with a checkout as a HINT only: the
 * server re-validates the code, the window and who it belongs to before
 * anything is stamped. `eventSlug` is what the web cookie knows (the link's
 * URL); the app sends the event id it resolved.
 */
export type ReferralHint = {
  code: string;
  touchedAt: string;
  source?: "link" | "qr" | "install_referrer";
  eventId?: string;
  eventSlug?: string;
};

// ─────────────────────────────────────────────────────────────
// Friend invites (Phase 5)
// ─────────────────────────────────────────────────────────────

/** What referral_bind answered (plus transport-level answers). */
export type ReferralBindResult =
  | "bound"
  | "already_bound"
  | "capture_off"
  | "program_off"
  | "unknown_code"
  | "own_code"
  | "too_late"
  | "not_new"
  | "circular"
  | "referrer_restricted"
  | "not_found"
  | "invalid"
  | "rate_limited"
  | "error";

export type ReferralBindOutcome = {
  result: ReferralBindResult;
  /** The inviter as the friend sees them: "Ama K." */
  referrerName: string | null;
  /** granted: welcome credit is in the account; needs_phone: it will be once their phone is verified. */
  welcome: "granted" | "needs_phone" | "none";
  welcomeMinor: number | null;
};

/** The caller's invite page: their link, the offer and how it's going. */
export type ReferralInvite = {
  /** Invites are live (referral capture on and the friend rule live). */
  enabled: boolean;
  code: string | null;
  inviteUrl: string | null;
  /** What the inviter gets when a friend qualifies. */
  referrerMinor: number | null;
  /** The friend's welcome credit. */
  refereeMinor: number | null;
  /** The friend's first ticket order must be at least this. */
  minOrderMinor: number | null;
  stats: {
    joined: number;
    qualified: number;
    rewarded: number;
    earnedMinor: number;
    pendingMinor: number;
  };
  /** Most recent friends first; first name and last initial only. */
  recent: {
    name: string;
    status: "joined" | "qualified" | "rewarded" | "expired";
    at: string;
  }[];
  invitedBy: { name: string; boundAt: string } | null;
  /** The caller can still enter a friend's invite code. */
  canBind: boolean;
};

/** What the public invite page shows for a code. */
export type ReferralCodeInfo = {
  valid: boolean;
  code: string | null;
  programOn: boolean;
  referrerName: string | null;
  referrerAvatar: { publicId: string; version: string | null } | null;
  welcomeMinor: number | null;
  minOrderMinor: number | null;
};

export type RebateKind = "organizer" | "venue" | "milestone";

/**
 * Promotion credit for organizers and venue owners (Phase 6): what they can
 * spend on featuring now, what the monthly rebates earned them, and the live
 * terms. Only live rebates are counted -- never shadow-mode decisions.
 */
export type PromotionCredit = {
  /** Rewards is switched on for the caller. */
  enabled: boolean;
  /** Paying for promotions with credit is switched on. */
  canRedeem: boolean;
  /** What the caller can put towards a promotion right now. */
  spendableMinor: number;
  /** The part of their credit that only pays for promotions. */
  promotionOnlyMinor: number;
  pendingMinor: number;
  earnedMinor: number;
  last: { periodStart: string; amountMinor: number } | null;
  recent: {
    kind: RebateKind;
    eventTitle: string | null;
    amountMinor: number;
    status: "pending" | "earned";
    periodStart: string | null;
    at: string;
  }[];
  rates: {
    organizerShareBps: number | null;
    venueShareBps: number | null;
    milestone: { uniqueBuyers: number; amountMinor: number } | null;
    expiryDays: number | null;
  };
};

// ─────────────────────────────────────────────────────────────
// Admin console (apps/admin › Rewards)
// ─────────────────────────────────────────────────────────────

export type AdminRewardsOverview = {
  balances: {
    accounts: number;
    frozenAccounts: number;
    inDebtAccounts: number;
    availableMinor: number;
    debtMinor: number;
    pendingMinor: number;
    reservedMinor: number;
    frozenMinor: number;
    withdrawingMinor: number;
    lifetimeEarnedMinor: number;
    lifetimeSpentMinor: number;
    lifetimeExpiredMinor: number;
    lifetimeReversedMinor: number;
  };
  /** Outstanding credit that can only be spent on promotions (≈ no cash cost). */
  promotionOnlyMinor: number;
  /** Absolute amount moved per journal type in the selected range. */
  flows: Partial<Record<CreditJournalType, number>>;
  pendingAdjustments: number;
  openDisputes: number;
  reconciliation: {
    unbalancedJournals: number;
    balanceCacheDrift: number;
    lotBucketDrift: number;
    lotInvalidState: number;
  };
  settings: RewardsProgramSettings;
  rules: RewardRuleSummary[];
};

export type RewardsProgramSettings = {
  rewardsEnabled: boolean;
  audience: "staff" | "beta" | "all";
  betaUserIds: string[];
  referralCaptureEnabled: boolean;
  shadowMode: boolean;
  redeemPromotionsEnabled: boolean;
  redeemTicketsEnabled: boolean;
  allowFullCreditTicketOrders: boolean;
  withdrawalsEnabled: boolean;
  maxCreditShareOfTicketOrderBps: number;
  minCashChargeMinor: number;
  budgetFloorMinor: number;
  budgetNetRevenueShareBps: number;
  dualApprovalThresholdMinor: number;
  supportGoodwillMonthlyCapMinor: number;
  creditSharePayoutHoldBps: number;
  withdrawalMinMinor: number;
  referralAttributionWindowDays: number;
  updatedAt: string;
  updatedBy: string | null;
};

export type RewardRuleSummary = {
  id: string;
  ruleKey: string;
  version: number;
  isActive: boolean;
  rateBps: number | null;
  netShareCapBps: number | null;
  flatMinor: number | null;
  minBasisMinor: number;
  caps: Record<string, unknown>;
  releasePolicy: string;
  lotKind: string;
  spendScope: string;
  expiryDays: number | null;
  withdrawable: boolean;
  note: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
};

export type AdminCreditAccountListItem = {
  userId: string;
  username: string | null;
  fullName: string | null;
  status: CreditAccountStatus;
  availableMinor: number;
  pendingMinor: number;
  lifetimeEarnedMinor: number;
  updatedAt: string;
};

export type AdminCreditLot = {
  id: string;
  kind: CreditLotKind;
  spendScope: CreditSpendScope;
  status: CreditLotStatus;
  originalMinor: number;
  remainingMinor: number;
  heldMinor: number;
  releasedMinor: number | null;
  withdrawable: boolean;
  expiresAt: string | null;
  releaseAt: string | null;
  label: string | null;
  sourceType: string | null;
  sourceId: string | null;
  createdAt: string;
};

export type AdminCreditJournalLine = {
  ledgerCode: string;
  isUserAccount: boolean;
  amountMinor: number;
  lotId: string | null;
};

export type AdminCreditJournal = {
  id: string;
  journalType: CreditJournalType;
  idempotencyKey: string;
  userDeltaMinor: number;
  visibleToUser: boolean;
  actorType: "system" | "user" | "admin";
  actorId: string | null;
  actorName: string | null;
  userLabel: string | null;
  memo: string | null;
  sourceType: string | null;
  sourceId: string | null;
  lotId: string | null;
  createdAt: string;
  lines: AdminCreditJournalLine[];
};

export type AdminCreditAdjustmentRequest = {
  id: string;
  userId: string;
  userName: string | null;
  direction: "credit" | "debit";
  amountMinor: number;
  spendScope: string;
  allowNegative: boolean;
  reason: string;
  userLabel: string | null;
  status: "pending" | "executed" | "rejected" | "cancelled";
  requiresSecondApprover: boolean;
  requestedBy: string;
  requestedByName: string | null;
  requestedAt: string;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  journalId: string | null;
};

export type AdminCreditAccountDetail = {
  user: {
    id: string;
    username: string | null;
    fullName: string | null;
    accountStatusId: number | null;
  };
  account: {
    status: CreditAccountStatus;
    statusReason: string | null;
    statusChangedAt: string | null;
    availableMinor: number;
    pendingMinor: number;
    reservedMinor: number;
    frozenMinor: number;
    withdrawingMinor: number;
    lifetimeEarnedMinor: number;
    lifetimeSpentMinor: number;
    lifetimeWithdrawnMinor: number;
    lifetimeExpiredMinor: number;
    lifetimeReversedMinor: number;
    updatedAt: string | null;
  };
  lots: AdminCreditLot[];
  journals: AdminCreditJournal[];
  adjustments: AdminCreditAdjustmentRequest[];
  goodwillUsedThisMonthMinor: number;
  goodwillMonthlyCapMinor: number;
  /** Adjustments at or above this need a second approver. */
  dualApprovalThresholdMinor: number;
  /** Friend invites: their code, who invited them, whom they invited. */
  referrals: {
    code: {
      code: string;
      disabledAt: string | null;
      disabledReason: string | null;
    } | null;
    invitedBy: {
      userId: string;
      name: string | null;
      status: string;
      source: string;
      boundAt: string;
    } | null;
    invited: {
      userId: string;
      name: string | null;
      status: string;
      boundAt: string;
    }[];
    invitedCount: number;
  };
};

export type RewardEventStatus =
  | "pending"
  | "held"
  | "released"
  | "voided"
  | "rejected"
  | "deferred"
  | "clawed_back";

/** One reward decision (admin only; risk flags are never shown to users). */
export type AdminRewardEvent = {
  id: string;
  ruleKey: string;
  ruleVersion: number | null;
  isShadow: boolean;
  status: RewardEventStatus;
  decision: "auto" | "review" | "reject";
  statusReason: string | null;
  amountMinor: number;
  releasedMinor: number | null;
  riskScore: number;
  riskFlags: string[];
  basis: Record<string, unknown>;
  beneficiary: { id: string; name: string | null };
  buyer: { id: string | null; name: string | null };
  event: { id: string | null; title: string | null };
  transactionId: string | null;
  releaseAt: string | null;
  createdAt: string;
  settledAt: string | null;
  review: { by: string | null; at: string | null; note: string | null };
};

/** Shadow-mode projection for tuning rates before anything is paid. */
export type AdminReferralSummary = {
  sinceDays: number;
  touches: number;
  attributedCheckouts: number;
  referredTicketRevenueMinor: number;
  referredNetRevenueMinor: number;
  byStatus: Partial<
    Record<RewardEventStatus, { count: number; amountMinor: number }>
  >;
  /** Projected rewards (pending + held + released) ÷ referred net revenue. */
  projectedCostShareBps: number | null;
  riskFlags: { flag: string; count: number }[];
  topReferrers: {
    userId: string;
    name: string | null;
    rewards: number;
    amountMinor: number;
  }[];
  engine: {
    outboxLagSeconds: number;
    deadLetters: number;
    settlementBacklog: number;
  };
  /** Friend invites (Phase 5) over the same period. */
  friend: {
    joined: number;
    /** The inviters' rewards, by status. */
    byStatus: Partial<
      Record<RewardEventStatus, { count: number; amountMinor: number }>
    >;
    /** How friends qualified (first order / own event's sales / place claim). */
    byPath: Partial<
      Record<"first_order" | "organizer_sales" | "place_claim", number>
    >;
    welcome: { granted: number; amountMinor: number; rejected: number };
  };
};

/** One monthly rebate run (Phase 6). */
export type AdminRebateRun = {
  id: string;
  periodStart: string;
  triggeredBy: string | null;
  shadowMode: boolean;
  startedAt: string;
  finishedAt: string | null;
  events: number;
  errors: number;
  skipped: string | null;
  lastError: string | null;
  byRule: Partial<
    Record<
      "organizer_rebate" | "venue_rebate" | "organizer_milestone",
      {
        decided: number;
        released: number;
        held: number;
        rejected: number;
        shadow: number;
        amountMinor: number;
      }
    >
  >;
};

/** Admin › Rewards › Rebates. */
export type AdminRebateSummary = {
  sinceDays: number;
  shadowMode: boolean;
  liveRules: ("organizer_rebate" | "venue_rebate" | "organizer_milestone")[];
  runs: AdminRebateRun[];
  byRule: Partial<
    Record<
      "organizer_rebate" | "venue_rebate" | "organizer_milestone",
      {
        count: number;
        amountMinor: number;
        shadowAmountMinor: number;
        rejected: number;
      }
    >
  >;
  /** Cash net revenue the rebates were priced from (live + shadow). */
  netRevenueMinor: number;
  rejectReasons: { reason: string; count: number }[];
  top: {
    userId: string;
    name: string | null;
    kind: "organizer" | "venue";
    amountMinor: number;
    events: number;
  }[];
};
