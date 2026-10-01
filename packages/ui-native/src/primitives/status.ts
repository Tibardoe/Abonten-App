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

export type StatusEntry = {
  kind: StatusKind;
  tone: StatusTone;
  icon: IoniconName;
  /** A catalog key in the common namespace ("status.pending"), or "" for
   * an unknown state; the override in ResolveOptions is already text. */
  label: string;
};

const REGISTRY: Record<StatusKind, Omit<StatusEntry, "kind">> = {
  success: {
    tone: "success",
    icon: "checkmark-circle",
    label: "status.successful",
  },
  approved: {
    tone: "success",
    icon: "checkmark-circle",
    label: "status.approved",
  },
  pending: { tone: "warning", icon: "time-outline", label: "status.pending" },
  processing: {
    tone: "warning",
    icon: "sync-outline",
    label: "status.processing",
  },
  refundPending: {
    tone: "warning",
    icon: "arrow-undo-outline",
    label: "status.refundPending",
  },
  failed: { tone: "danger", icon: "close-circle", label: "status.failed" },
  cancelled: {
    tone: "danger",
    icon: "close-circle",
    label: "status.cancelled",
  },
  rejected: { tone: "danger", icon: "close-circle", label: "status.rejected" },
  reversed: {
    tone: "danger",
    icon: "arrow-undo-outline",
    label: "status.reversed",
  },
  refunded: {
    tone: "neutral",
    icon: "arrow-undo-outline",
    label: "status.refunded",
  },
  expired: { tone: "neutral", icon: "time-outline", label: "status.expired" },
  used: {
    tone: "neutral",
    icon: "checkmark-done-circle",
    label: "status.used",
  },
  inactive: {
    tone: "neutral",
    icon: "ellipse-outline",
    label: "status.inactive",
  },
  draft: { tone: "neutral", icon: "document-outline", label: "status.draft" },
  ended: { tone: "neutral", icon: "flag-outline", label: "status.ended" },
  active: { tone: "brand", icon: "checkmark-circle", label: "status.active" },
  upcoming: {
    tone: "brand",
    icon: "calendar-outline",
    label: "status.upcoming",
  },
  ongoing: { tone: "brand", icon: "radio-outline", label: "status.ongoing" },
  soldOut: {
    tone: "neutral",
    icon: "pricetag-outline",
    label: "status.soldOut",
  },
  unknown: { tone: "neutral", icon: "ellipse-outline", label: "" },
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
  const label =
    opts.label ??
    (base.label ||
      // Unknown status: title-case the raw value so nothing renders blank.
      key
        .split("_")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "));
  return { kind, tone: base.tone, icon: base.icon, label };
}

export function statusEntry(kind: StatusKind): StatusEntry {
  return { kind, ...REGISTRY[kind] };
}
