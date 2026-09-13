// Human labels for the database words the console used to print raw.
//
// An operator was being shown `refund_hold`, `fee_refund_adjustment`,
// `clawed_back`, `needs_info`, `pending_review` and `event_review` — schema
// vocabulary that says nothing about what to do. Every enum the console
// renders resolves through here, so one word means one thing on every page
// and an unmapped value degrades to readable text rather than a raw key.

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

/** Meaning is carried by label + icon, never by colour alone. */
export type StatusIcon =
  | "check"
  | "clock"
  | "x"
  | "alert"
  | "pause"
  | "dot"
  | "undo"
  | "flag";

export type StatusMeta = {
  label: string;
  tone: StatusTone;
  icon: StatusIcon;
  /** One sentence for a tooltip, where the label alone leaves a question. */
  description?: string;
};

export type StatusFamily =
  | "transaction"
  | "checkout"
  | "payout"
  | "payoutReview"
  | "ledgerEntry"
  | "feeEntry"
  | "rewardEvent"
  | "errorGroup"
  | "incident"
  | "incidentSeverity"
  | "report"
  | "reportPriority"
  | "verification"
  | "claim"
  | "ticket"
  | "event"
  | "moderation"
  | "userAccount";

const TRANSACTION: Record<string, StatusMeta> = {
  successful: { label: "Paid", tone: "success", icon: "check" },
  pending: {
    label: "Payment pending",
    tone: "warning",
    icon: "clock",
    description: "Started but not confirmed by Paystack yet.",
  },
  failed: { label: "Failed", tone: "danger", icon: "x" },
  refund_pending: {
    label: "Refund pending",
    tone: "warning",
    icon: "clock",
    description:
      "A refund has been requested but the money has not gone back yet.",
  },
  refunded: {
    label: "Refunded",
    tone: "neutral",
    icon: "undo",
    description:
      "The ticket price was returned. Abonten keeps the service fee.",
  },
};

const CHECKOUT: Record<string, StatusMeta> = {
  pending: { label: "Awaiting payment", tone: "warning", icon: "clock" },
  paid: { label: "Paid", tone: "success", icon: "check" },
  cancelled: { label: "Cancelled", tone: "neutral", icon: "x" },
  expired: {
    label: "Expired",
    tone: "neutral",
    icon: "clock",
    description: "The buyer did not pay before the held tickets were released.",
  },
};

const PAYOUT: Record<string, StatusMeta> = {
  processing: {
    label: "In progress",
    tone: "warning",
    icon: "clock",
    description:
      "Requested and reserved against the organizer's balance, not yet settled.",
  },
  completed: { label: "Paid", tone: "success", icon: "check" },
  failed: {
    label: "Failed",
    tone: "danger",
    icon: "x",
    description: "The money came back to the organizer's balance.",
  },
  cancelled: { label: "Cancelled", tone: "neutral", icon: "x" },
};

const PAYOUT_REVIEW: Record<string, StatusMeta> = {
  none: { label: "No review needed", tone: "neutral", icon: "dot" },
  required: {
    label: "Held for review",
    tone: "danger",
    icon: "alert",
    description:
      "More than a fifth of the covered sales were paid with Abonten Credit, so an admin must clear it first.",
  },
  cleared: { label: "Review cleared", tone: "success", icon: "check" },
};

const LEDGER_ENTRY: Record<string, StatusMeta> = {
  earning: {
    label: "Ticket earning",
    tone: "success",
    icon: "check",
    description: "The full ticket price from one paid order.",
  },
  refund_adjustment: {
    label: "Refund deducted",
    tone: "warning",
    icon: "undo",
    description: "Legacy: refunds are deducted at request time now.",
  },
  refund_hold: {
    label: "Refund deducted",
    tone: "warning",
    icon: "undo",
    description:
      "Taken off the moment a refund was requested. Put back only if the refund fails.",
  },
  refund_release: {
    label: "Refund returned",
    tone: "info",
    icon: "undo",
    description: "The refund failed, so the deduction was reversed.",
  },
  payout_hold: {
    label: "Payout reserved",
    tone: "info",
    icon: "clock",
    description: "Set aside when the payout was created.",
  },
  payout_release: {
    label: "Payout returned",
    tone: "info",
    icon: "undo",
    description: "The payout failed or was cancelled, so the money came back.",
  },
  promoter_commission: {
    label: "Promoter commission",
    tone: "warning",
    icon: "dot",
    description: "Charged to the organizer for a sale made through a promoter.",
  },
  promoter_commission_reversal: {
    label: "Commission reversed",
    tone: "info",
    icon: "undo",
  },
};

const FEE_ENTRY: Record<string, StatusMeta> = {
  fee: { label: "Sale", tone: "success", icon: "check" },
  fee_refund_adjustment: {
    label: "Refund",
    tone: "neutral",
    icon: "undo",
    description: "The negative mirror of a sale, written when money went back.",
  },
};

const REWARD_EVENT: Record<string, StatusMeta> = {
  pending: {
    label: "Waiting to settle",
    tone: "info",
    icon: "clock",
    description: "Earned, but not usable until the event it came from settles.",
  },
  held: {
    label: "Held for review",
    tone: "warning",
    icon: "alert",
    description: "The risk checks stopped it; an admin decides.",
  },
  released: { label: "Paid", tone: "success", icon: "check" },
  voided: {
    label: "Voided",
    tone: "neutral",
    icon: "x",
    description:
      "Cancelled before it paid — usually a refund or a cancelled event.",
  },
  rejected: { label: "Refused", tone: "danger", icon: "x" },
  deferred: {
    label: "Over budget",
    tone: "warning",
    icon: "pause",
    description: "The month's reward budget was used up.",
  },
  clawed_back: {
    label: "Clawed back",
    tone: "danger",
    icon: "undo",
    description: "Paid, then taken back after the sale behind it was undone.",
  },
};

const ERROR_GROUP: Record<string, StatusMeta> = {
  open: { label: "Open", tone: "danger", icon: "alert" },
  acknowledged: { label: "Acknowledged", tone: "warning", icon: "clock" },
  resolved: { label: "Resolved", tone: "success", icon: "check" },
  ignored: { label: "Ignored", tone: "neutral", icon: "pause" },
};

const INCIDENT: Record<string, StatusMeta> = {
  investigating: { label: "Investigating", tone: "danger", icon: "alert" },
  identified: { label: "Cause found", tone: "warning", icon: "flag" },
  monitoring: { label: "Watching", tone: "info", icon: "clock" },
  resolved: { label: "Resolved", tone: "success", icon: "check" },
};

const INCIDENT_SEVERITY: Record<string, StatusMeta> = {
  low: { label: "Low", tone: "neutral", icon: "dot" },
  medium: { label: "Medium", tone: "info", icon: "dot" },
  high: { label: "High", tone: "warning", icon: "alert" },
  critical: { label: "Critical", tone: "danger", icon: "alert" },
};

const REPORT: Record<string, StatusMeta> = {
  new: { label: "New", tone: "info", icon: "flag" },
  under_review: { label: "Under review", tone: "warning", icon: "clock" },
  awaiting_info: {
    label: "Waiting on the reporter",
    tone: "warning",
    icon: "clock",
  },
  escalated: { label: "Escalated", tone: "danger", icon: "alert" },
  resolved: { label: "Resolved", tone: "success", icon: "check" },
  dismissed: { label: "Dismissed", tone: "neutral", icon: "x" },
  false_report: { label: "False report", tone: "neutral", icon: "x" },
};

const REPORT_PRIORITY: Record<string, StatusMeta> = {
  low: { label: "Low", tone: "neutral", icon: "dot" },
  normal: { label: "Normal", tone: "neutral", icon: "dot" },
  high: { label: "High", tone: "warning", icon: "alert" },
  urgent: { label: "Urgent", tone: "danger", icon: "alert" },
};

const VERIFICATION: Record<string, StatusMeta> = {
  draft: { label: "Not submitted", tone: "neutral", icon: "dot" },
  pending_review: { label: "Waiting on us", tone: "info", icon: "clock" },
  needs_info: {
    label: "Waiting on the applicant",
    tone: "warning",
    icon: "clock",
    description: "We asked for more documents.",
  },
  approved: { label: "Verified", tone: "success", icon: "check" },
  rejected: { label: "Rejected", tone: "danger", icon: "x" },
  revoked: {
    label: "Revoked",
    tone: "danger",
    icon: "undo",
    description: "The badge was taken back after it had been granted.",
  },
  withdrawn: { label: "Withdrawn", tone: "neutral", icon: "x" },
};

const CLAIM: Record<string, StatusMeta> = {
  pending: { label: "Waiting on us", tone: "info", icon: "clock" },
  approved: { label: "Approved", tone: "success", icon: "check" },
  rejected: { label: "Rejected", tone: "danger", icon: "x" },
};

const TICKET: Record<string, StatusMeta> = {
  active: { label: "Valid", tone: "success", icon: "check" },
  used: { label: "Checked in", tone: "info", icon: "check" },
  expired: { label: "Expired", tone: "neutral", icon: "clock" },
  cancelled: { label: "Cancelled", tone: "neutral", icon: "x" },
};

const EVENT: Record<string, StatusMeta> = {
  draft: {
    label: "Draft",
    tone: "neutral",
    icon: "dot",
    description: "Not visible to anyone but the organizer.",
  },
  published: { label: "Published", tone: "success", icon: "check" },
  canceled: { label: "Cancelled", tone: "danger", icon: "x" },
  completed: { label: "Finished", tone: "neutral", icon: "check" },
};

const MODERATION: Record<string, StatusMeta> = {
  visible: { label: "Visible", tone: "success", icon: "check" },
  restricted: {
    label: "Restricted",
    tone: "info",
    icon: "pause",
    description: "Still reachable by link, kept out of discovery.",
  },
  hidden: {
    label: "Hidden",
    tone: "warning",
    icon: "pause",
    description: "Taken out of every public surface; can be restored.",
  },
  removed: { label: "Removed", tone: "danger", icon: "x" },
};

const USER_ACCOUNT: Record<string, StatusMeta> = {
  "1": { label: "Active", tone: "success", icon: "check" },
  "2": {
    label: "Suspended",
    tone: "warning",
    icon: "pause",
    description: "Cannot sign in until an admin restores the account.",
  },
  "3": { label: "Banned", tone: "danger", icon: "x" },
  "4": {
    label: "Deleted",
    tone: "neutral",
    icon: "x",
    description:
      "Deleted by its owner. The row stays so payments and tickets survive.",
  },
  Active: { label: "Active", tone: "success", icon: "check" },
  Suspended: { label: "Suspended", tone: "warning", icon: "pause" },
  Banned: { label: "Banned", tone: "danger", icon: "x" },
  Deleted: { label: "Deleted", tone: "neutral", icon: "x" },
};

export const STATUS_LABELS: Record<StatusFamily, Record<string, StatusMeta>> = {
  transaction: TRANSACTION,
  checkout: CHECKOUT,
  payout: PAYOUT,
  payoutReview: PAYOUT_REVIEW,
  ledgerEntry: LEDGER_ENTRY,
  feeEntry: FEE_ENTRY,
  rewardEvent: REWARD_EVENT,
  errorGroup: ERROR_GROUP,
  incident: INCIDENT,
  incidentSeverity: INCIDENT_SEVERITY,
  report: REPORT,
  reportPriority: REPORT_PRIORITY,
  verification: VERIFICATION,
  claim: CLAIM,
  ticket: TICKET,
  event: EVENT,
  moderation: MODERATION,
  userAccount: USER_ACCOUNT,
};

/** `refund_hold` -> `Refund hold`: readable even when unmapped. */
export function humanizeStatus(raw: string): string {
  const words = raw.replace(/[._]/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function statusMeta(
  family: StatusFamily,
  raw: string | number | null | undefined,
): StatusMeta {
  if (raw === null || raw === undefined || raw === "") {
    return { label: "—", tone: "neutral", icon: "dot" };
  }
  const key = String(raw);
  const found = STATUS_LABELS[family][key];
  if (found) return found;
  // An enum value the console has not been taught yet still reads as words,
  // not as a database key.
  return { label: humanizeStatus(key), tone: "neutral", icon: "dot" };
}

const HEALTH_CHECK_LABELS: Record<string, string> = {
  self: "Web endpoint",
  db: "Database",
  auth: "Sign-in",
  storage: "File storage",
  paystack: "Paystack (payments)",
  resend: "Resend (email)",
  hubtel: "Hubtel (SMS codes)",
  cloudinary: "Cloudinary (images)",
  expo: "Expo (push)",
  rewards_health: "Rewards backlog",
  fieldops: "Field Ops backlog",
  discovery: "Discovery backlog",
  weekly: "Abonten Weekly jobs",
};

export function healthCheckLabel(key: string): string {
  return HEALTH_CHECK_LABELS[key] ?? humanizeStatus(key);
}

/** What the report list calls the thing a report is about. */
const REPORT_TARGET_LABELS: Record<string, string> = {
  event: "Event",
  place: "Place",
  user: "Person",
  organizer: "Organizer",
  event_review: "Review of an event",
  place_review: "Review of a place",
  user_review: "Review of a person",
  highlight: "Highlight",
  conversation: "Message thread",
  message: "Message",
};

export function reportTargetLabel(targetType: string): string {
  return REPORT_TARGET_LABELS[targetType] ?? humanizeStatus(targetType);
}
