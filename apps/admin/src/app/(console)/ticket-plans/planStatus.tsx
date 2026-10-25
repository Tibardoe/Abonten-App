import { Badge, cn } from "@/components/ui";
import { formatMoney } from "@abonten/core/money/formatMoney";
import type {
  TicketPlanEndReason,
  TicketPlanPartRefundStatus,
  TicketPlanRefundStatus,
  TicketPlanStatus,
} from "@abonten/types/ticketPlanType";
import Link from "next/link";

// Words and tones for Admin › Pay small small. The admin console is
// English-only; the buyer-facing words live in the ticketPlans catalog.

const STATUS: Record<
  TicketPlanStatus,
  { label: string; tone: "neutral" | "info" | "success" | "warning" }
> = {
  awaiting_payment: { label: "Waiting for first part", tone: "warning" },
  active: { label: "Paying", tone: "info" },
  settling: { label: "Issuing tickets", tone: "info" },
  completed: { label: "Completed", tone: "success" },
  expired: { label: "Hold expired", tone: "neutral" },
  lapsed: { label: "Lapsed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function planStatusBadge(status: TicketPlanStatus) {
  const s = STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const REFUND: Record<
  TicketPlanRefundStatus,
  { label: string; tone: "neutral" | "info" | "success" | "danger" } | null
> = {
  none: null,
  pending: { label: "Refund pending", tone: "info" },
  refunded: { label: "Refunded", tone: "success" },
  failed: { label: "Refund needs staff", tone: "danger" },
};

export function refundBadge(status: TicketPlanRefundStatus) {
  const r = REFUND[status];
  return r ? <Badge tone={r.tone}>{r.label}</Badge> : null;
}

export const PART_REFUND: Record<TicketPlanPartRefundStatus, string> = {
  none: "—",
  planned: "Planned",
  requesting: "Being asked",
  requested: "Asked, waiting for the provider",
  processed: "Refunded",
  failed: "Needs staff",
};

export const END_REASON: Record<TicketPlanEndReason, string> = {
  hold_expired: "The first part never came",
  deadline: "Not finished by the deadline",
  buyer: "Cancelled by the buyer",
  event_cancelled: "The event was cancelled",
  account_closed: "The buyer closed their account",
  admin: "Ended by staff",
};

export function minor(amountMinor: number, currency: string): string {
  return formatMoney({ amountMinor, currency }, { locale: "en" });
}

const TABS = [
  { href: "/ticket-plans", label: "Plans" },
  { href: "/ticket-plans/settings", label: "Settings" },
];

export function TicketPlanTabs({ active }: { active: string }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-border pb-2">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active === t.href ? "page" : undefined}
          className={cn(
            "rounded px-3 py-1.5 text-xs",
            active === t.href
              ? "bg-primary text-primary-foreground"
              : "border border-border hover:bg-muted",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
