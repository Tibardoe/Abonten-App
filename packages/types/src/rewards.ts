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
  redemption: {
    tickets: boolean;
    promotions: boolean;
    allowFullCreditTicketOrders: boolean;
    minCashChargeMinor: number;
  };
  withdrawals: { enabled: boolean; minMinor: number };
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
};
