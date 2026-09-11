import { Badge, Table, Td, Th, timeAgo } from "@/components/ui";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import {
  BLOCKING_RISK_FLAGS,
  riskFlagLabel,
} from "@abonten/core/rewards/riskScore";
import type {
  AdminRewardEvent,
  RewardEventStatus,
} from "@abonten/types/rewards";
import Link from "next/link";
import type { ReactNode } from "react";

const STATUS_TONE: Record<
  RewardEventStatus,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  pending: "info",
  held: "warning",
  released: "success",
  voided: "neutral",
  rejected: "danger",
  deferred: "warning",
  clawed_back: "danger",
};

const REASONS: Record<string, string> = {
  refunded: "refunded",
  cancelled: "tickets cancelled",
  event_cancelled: "event cancelled",
  event_removed: "event removed",
  event_hidden: "event hidden",
  open_dispute: "chargeback open",
  referrer_restricted: "referrer restricted",
  risk: "risk score",
  risk_review: "risk review",
  budget_exhausted: "monthly budget used up",
  buyer_event_cap: "buyer already rewarded for this event",
  referrer_cap: "referrer cap reached",
  min_basis: "order below minimum",
  no_net_revenue: "no cash revenue (e.g. paid with credit)",
  no_payment: "not a paid order",
  phone_not_verified: "referrer phone not verified",
  friend_phone_not_verified: "friend's phone not verified",
  rejected_by_review: "rejected in review",
  not_first_order: "friend had already bought a ticket",
  not_enough_buyers: "event lost its qualifying buyers",
  claim_revoked: "place claim no longer approved",
  place_removed: "place removed",
  place_hidden: "place hidden",
};

const RULE_LABELS: Record<string, string> = {
  event_referral: "Event referral",
  friend_referral_referrer: "Friend invite",
  friend_referral_referee: "Welcome credit",
};

const PATH_LABELS: Record<string, string> = {
  first_order: "friend's first ticket order",
  organizer_sales: "friend's event sold to enough buyers",
  place_claim: "friend's place claim approved",
};

// What earned the reward, in one line (the "sale" column).
function sourceLine(e: AdminRewardEvent): string {
  if (e.ruleKey === "friend_referral_referee") {
    return "Joined with an invite";
  }
  if (e.ruleKey === "friend_referral_referrer") {
    const path = typeof e.basis.path === "string" ? e.basis.path : "";
    return PATH_LABELS[path] ?? "Friend qualified";
  }
  return e.event.title ?? "Event removed";
}

export function statusReason(
  reason: string | null,
  flags: string[] = [],
): string | null {
  if (!reason) return null;
  if (reason === "risk") {
    const blocking = flags.find((f) =>
      (BLOCKING_RISK_FLAGS as readonly string[]).includes(f),
    );
    if (blocking) return `blocked: ${riskFlagLabel(blocking).toLowerCase()}`;
  }
  return REASONS[reason] ?? reason.replace(/_/g, " ");
}

// The engine's decisions, newest first. Risk flags are admin-only.
export function RewardEventTable({
  events,
  actions,
}: {
  events: AdminRewardEvent[];
  actions?: (event: AdminRewardEvent) => ReactNode;
}) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>When</Th>
          <Th>Earned by</Th>
          <Th>What earned it</Th>
          <Th className="text-right">Reward</Th>
          <Th>Status</Th>
          <Th>Risk</Th>
          {actions ? <Th>Decision</Th> : null}
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <tr key={e.id} className="align-top hover:bg-muted/40">
            <Td className="whitespace-nowrap text-xs text-muted-foreground">
              {timeAgo(e.createdAt)}
            </Td>
            <Td>
              <Link
                href={`/rewards/accounts/${e.beneficiary.id}`}
                className="font-medium text-primary hover:underline"
              >
                {e.beneficiary.name ?? `${e.beneficiary.id.slice(0, 8)}…`}
              </Link>
              <div className="text-xs text-muted-foreground">
                {RULE_LABELS[e.ruleKey] ?? e.ruleKey}
              </div>
            </Td>
            <Td>
              <div>{sourceLine(e)}</div>
              {e.ruleKey === "friend_referral_referee" ? null : (
                <div className="text-xs text-muted-foreground">
                  {e.ruleKey === "friend_referral_referrer"
                    ? "Friend"
                    : "Buyer"}
                  : {e.buyer.name ?? "unknown"}
                  {e.ruleKey === "friend_referral_referrer" && e.event.title
                    ? ` · ${e.event.title}`
                    : ""}
                  {typeof e.basis.ticket_revenue_minor === "number"
                    ? ` · ${formatCredit(e.basis.ticket_revenue_minor)} of tickets`
                    : ""}
                </div>
              )}
              {e.transactionId ? (
                <Link
                  href={`/finance/transactions/${e.transactionId}`}
                  className="text-xs text-primary hover:underline"
                >
                  Transaction
                </Link>
              ) : null}
            </Td>
            <Td className="text-right tabular-nums">
              {formatCredit(
                e.status === "released"
                  ? (e.releasedMinor ?? 0)
                  : e.amountMinor,
              )}
              {e.status !== "rejected" &&
              typeof e.basis.limited_by === "string" &&
              e.basis.limited_by !== "rate" ? (
                <div className="text-xs text-muted-foreground">
                  capped: {String(e.basis.limited_by).replace(/_/g, " ")}
                </div>
              ) : null}
            </Td>
            <Td>
              <div className="flex flex-wrap gap-1">
                <Badge tone={STATUS_TONE[e.status]}>
                  {e.status.replace("_", " ")}
                </Badge>
                {e.isShadow ? <Badge tone="neutral">shadow</Badge> : null}
              </div>
              {statusReason(e.statusReason, e.riskFlags) ? (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {statusReason(e.statusReason, e.riskFlags)}
                </div>
              ) : null}
              {e.status === "pending" && e.releaseAt ? (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  unlocks {new Date(e.releaseAt).toLocaleDateString()}
                </div>
              ) : null}
              {e.review.at ? (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  reviewed by {e.review.by ?? "an admin"}: {e.review.note}
                </div>
              ) : null}
            </Td>
            <Td>
              <div className="tabular-nums">{e.riskScore}</div>
              {e.riskFlags.length > 0 ? (
                <ul className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                  {e.riskFlags.map((f) => (
                    <li key={f}>{riskFlagLabel(f)}</li>
                  ))}
                </ul>
              ) : null}
            </Td>
            {actions ? <Td>{actions(e)}</Td> : null}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
