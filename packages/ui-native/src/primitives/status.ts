import type { IoniconName } from "./Icon";

// The one place the whole native app decides what a status *means*. Every
// screen that shows a lifecycle / payment / refund / payout / claim state
// (Organizer dashboard, Finances, Transactions, Tickets, Refunds, cards,
// Notifications, Checkout, Payment verification) routes its raw backend
// string through `resolveStatus` so the same state always reads the same
// way — same wording, same tone, same icon.
//
// Framework-free: just data + a normaliser. <StatusPill> renders it.

/** Visual families. Each maps to exactly one brand token in <StatusPill>. */
export type StatusTone =
  | "success" // settled / paid / approved / done
  | "warning" // in-flight / awaiting action
  | "danger" // failed / cancelled / rejected / reversed
  | "neutral" // inert / historical / draft
  | "brand"; // live-and-good (ongoing, upcoming, held ticket)

export type StatusKind =
  | "success"
  | "pending"
  | "processing"
  | "failed"
  | "cancelled"
  | "rejected"
  | "reversed"
  | "refunded"
  | "refundPending"
  | "expired"
  | "used"
  | "active"
  | "inactive"
  | "approved"
  | "draft"
  | "upcoming"
  | "ongoing"
  | "ended"
  | "soldOut"
  | "unknown";

type RegistryEntry = {
  tone: StatusTone;
  icon: IoniconName;
  /** The state's name: a key of the `common` catalog, or null for a state
   * the registry has no name for. */
  labelKey: string | null;
};

const REGISTRY = {
  success: {
    tone: "success",
    icon: "checkmark-circle",
    labelKey: "status.successful",
  },
  approved: {
    tone: "success",
    icon: "checkmark-circle",
    labelKey: "status.approved",
  },
  pending: {
    tone: "warning",
    icon: "time-outline",
    labelKey: "status.pending",
  },
  processing: {
    tone: "warning",
    icon: "sync-outline",
    labelKey: "status.processing",
  },
  refundPending: {
    tone: "warning",
    icon: "arrow-undo-outline",
    labelKey: "status.refundPending",
  },
  failed: { tone: "danger", icon: "close-circle", labelKey: "status.failed" },
  cancelled: {
    tone: "danger",
    icon: "close-circle",
    labelKey: "status.cancelled",
  },
  rejected: {
    tone: "danger",
    icon: "close-circle",
    labelKey: "status.rejected",
  },
  reversed: {
    tone: "danger",
    icon: "arrow-undo-outline",
    labelKey: "status.reversed",
  },
  refunded: {
    tone: "neutral",
    icon: "arrow-undo-outline",
    labelKey: "status.refunded",
  },
  expired: {
    tone: "neutral",
    icon: "time-outline",
    labelKey: "status.expired",
  },
  used: {
    tone: "neutral",
    icon: "checkmark-done-circle",
    labelKey: "status.used",
  },
  inactive: {
    tone: "neutral",
    icon: "ellipse-outline",
    labelKey: "status.inactive",
  },
  draft: {
    tone: "neutral",
    icon: "document-outline",
    labelKey: "status.draft",
  },
  ended: { tone: "neutral", icon: "flag-outline", labelKey: "status.ended" },
  active: {
    tone: "brand",
    icon: "checkmark-circle",
    labelKey: "status.active",
  },
  upcoming: {
    tone: "brand",
    icon: "calendar-outline",
    labelKey: "status.upcoming",
  },
  ongoing: { tone: "brand", icon: "radio-outline", labelKey: "status.ongoing" },
  soldOut: {
    tone: "neutral",
    icon: "pricetag-outline",
    labelKey: "status.soldOut",
  },
  unknown: { tone: "neutral", icon: "ellipse-outline", labelKey: null },
} as const satisfies Record<StatusKind, RegistryEntry>;

/** Every name the registry can give a state: keys of the `common` catalog. */
export type StatusLabelKey = NonNullable<
  (typeof REGISTRY)[StatusKind]["labelKey"]
>;

export type StatusEntry = {
  kind: StatusKind;
  tone: StatusTone;
  icon: IoniconName;
  /**
   * The state's name as a key of the `common` catalog ("status.pending"):
   * translate it. Null when `text` says it instead.
   */
  labelKey: StatusLabelKey | null;
  /**
   * Words to show as they are: a caller's own label, or a state the
   * registry does not know, made readable. Never a catalog key. Null when
   * `labelKey` names the state.
   */
  text: string | null;
};

/**
 * Raw backend spellings → canonical kind. Covers payment_attempt.status,
 * transaction status, refund_status, organizer_payout.status,
 * organizer_ledger_entry.status, event lifecycle and ticket.status.
 */
const NORMALISE: Record<string, StatusKind> = {
  // success family
  success: "success",
  successful: "success",
  succeeded: "success",
  paid: "success",
  completed: "success",
  complete: "success",
  settled: "success",
  available: "success",
  released: "success",
  confirmed: "success",
  published: "success",
  approved: "approved",
  // in-flight
  pending: "pending",
  awaiting_payment: "pending",
  initiated: "pending",
  requested: "pending",
  queued: "pending",
  processing: "processing",
  in_progress: "processing",
  sending: "processing",
  // failed family
  failed: "failed",
  error: "failed",
  declined: "failed",
  abandoned: "failed",
  cancelled: "cancelled",
  canceled: "cancelled",
  voided: "cancelled",
  rejected: "rejected",
  reversed: "reversed",
  chargeback: "reversed",
  // refunds
  refunded: "refunded",
  refund: "refunded",
  partially_refunded: "refunded",
  refund_pending: "refundPending",
  refund_processing: "processing",
  refund_failed: "failed",
  refund_rejected: "rejected",
  // inert
  expired: "expired",
  used: "used",
  checked_in: "used",
  inactive: "inactive",
  draft: "draft",
  ended: "ended",
  ongoing: "ongoing",
  live: "ongoing",
  upcoming: "upcoming",
  scheduled: "upcoming",
  sold_out: "soldOut",
  soldout: "soldOut",
  active: "active",
  none: "unknown",
};

export type ResolveOptions = {
  /** Force a label (e.g. "Refund requested") while keeping the resolved tone/icon. */
  label?: string;
  /** Fall back to this kind when the raw string isn't recognised. */
  fallback?: StatusKind;
};

/** Normalise any backend status string into a renderable {kind,tone,icon,label}. */
export function resolveStatus(
  raw: string | null | undefined,
  opts: ResolveOptions = {},
): StatusEntry {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const kind = NORMALISE[key] ?? opts.fallback ?? "unknown";
  const base = REGISTRY[kind];
  const text =
    opts.label ??
    (base.labelKey
      ? null
      : // Unknown status: title-case the raw value so nothing renders blank.
        key
          .split("_")
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "));
  return {
    kind,
    tone: base.tone,
    icon: base.icon,
    labelKey: text === null ? base.labelKey : null,
    text,
  };
}

export function statusEntry(kind: StatusKind): StatusEntry {
  const base = REGISTRY[kind];
  return {
    kind,
    tone: base.tone,
    icon: base.icon,
    labelKey: base.labelKey,
    text: null,
  };
}

/**
 * The words for a resolved status. `t` is a translator of the `common`
 * catalog. Printing `entry.labelKey` itself shows "status.pending" to a
 * person, which the transaction screen did.
 */
export function statusLabel(
  t: (key: StatusLabelKey) => string,
  entry: StatusEntry,
): string {
  if (entry.text !== null) return entry.text;
  return entry.labelKey ? t(entry.labelKey) : "";
}
