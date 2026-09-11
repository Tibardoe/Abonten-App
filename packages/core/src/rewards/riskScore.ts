// The reward engine's deterministic risk score. The database
// (_reward_evaluate_event_referral / _reward_risk_weight) is where it is
// enforced; this mirrors the same table so the admin console can explain a
// decision and tests can pin the thresholds. Weights can be overridden in
// reward_program_setting.risk_weights (same keys).
//
// Risk flags are never shown to users.

export const BLOCKING_RISK_FLAGS = [
  "self_referral",
  "organizer_linked",
  "same_email",
  "same_phone",
  "same_payment_method",
] as const;

export const DEFAULT_RISK_WEIGHTS = {
  shared_device: 60,
  new_buyer_account: 15,
  referrer_refund_rate: 40,
  event_concentration: 25,
  velocity: 30,
  open_dispute: 80,
  checked_in: -15,
  review_threshold: 30,
  reject_threshold: 70,
} as const;

export type RiskFlag =
  | (typeof BLOCKING_RISK_FLAGS)[number]
  | Exclude<
      keyof typeof DEFAULT_RISK_WEIGHTS,
      "review_threshold" | "reject_threshold"
    >;

export type RiskDecision = "auto" | "review" | "reject";

export function scoreRisk(
  flags: readonly string[],
  overrides: Partial<Record<string, number>> = {},
): { score: number; decision: RiskDecision; blockedBy: string | null } {
  const weight = (key: string): number => {
    const override = overrides[key];
    if (typeof override === "number" && Number.isFinite(override)) {
      return override;
    }
    return (DEFAULT_RISK_WEIGHTS as Record<string, number>)[key] ?? 0;
  };

  const score = Math.max(
    0,
    flags.reduce((sum, flag) => sum + weight(flag), 0),
  );
  const blockedBy =
    flags.find((flag) =>
      (BLOCKING_RISK_FLAGS as readonly string[]).includes(flag),
    ) ?? null;

  const decision: RiskDecision =
    blockedBy || score >= weight("reject_threshold")
      ? "reject"
      : score >= weight("review_threshold")
        ? "review"
        : "auto";

  return { score, decision, blockedBy };
}

const LABELS: Record<string, string> = {
  self_referral: "Buyer used their own link",
  organizer_linked: "Organizer involved (own event)",
  same_email: "Same email address as the referrer",
  same_phone: "Same phone number as the referrer",
  same_payment_method: "Paid with the referrer's card or wallet",
  shared_device: "Same device as the referrer",
  new_buyer_account: "Buyer account under 24 hours old",
  referrer_refund_rate: "Referrer's sales are often refunded",
  event_concentration: "Most of this event's sales came from this referrer",
  velocity: "Unusually many referred sales in a day",
  open_dispute: "Chargeback open on the sale",
  checked_in: "Ticket was checked in (lowers risk)",
};

/** Admin-facing explanation of a flag. */
export function riskFlagLabel(flag: string): string {
  return LABELS[flag] ?? flag.replace(/_/g, " ");
}
