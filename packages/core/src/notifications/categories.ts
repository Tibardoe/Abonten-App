// Which notification types a person may switch off, and which they may not.
//
// Transactional notices (tickets, payments, refunds, event cancellations,
// security, verification, claims, support, field ops, promotions they paid
// for) always reach the phone. Social notices can be muted from the
// preference centre; the in-app row is still written. Rewards have their own
// email switch. Recommendations only ever travel through the delivery queue
// (source 'recommendations') and are governed there.
//
// The SQL twin for queued notices is _notification_optional_category() in
// supabase/migrations/20260913090400_recommendations_engine.sql; keep the
// social list identical.

export type NotificationCategory =
  | "transactional"
  | "social"
  | "rewards"
  | "recommendations";

const SOCIAL_TYPES = new Set(["message", "review_received", "review_reply"]);

const REWARD_TYPES = new Set([
  "reward_available",
  "reward_pending",
  "reward_reversed",
  "welcome_credit",
  "promotion_credit_earned",
  "referral_joined",
  "referral_qualified",
  "milestone_reached",
  "loyalty_reward",
  "commission_pending",
]);

export function notificationCategory(type: string): NotificationCategory {
  if (SOCIAL_TYPES.has(type) || type.startsWith("place_booking_")) {
    return "social";
  }
  if (REWARD_TYPES.has(type)) return "rewards";
  if (type === "recommendation_digest") return "recommendations";
  return "transactional";
}

/** True when a person's preferences can stop this type's push. */
export function isOptionalNotificationType(type: string): boolean {
  return notificationCategory(type) !== "transactional";
}
