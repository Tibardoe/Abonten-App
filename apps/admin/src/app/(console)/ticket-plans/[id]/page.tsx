import {
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  timeAgo,
} from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadTicketPlanDetail } from "@/lib/data";
import { OPS_TIME_ZONE_LABEL, formatOpsDateTime } from "@/lib/format";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import { ticketTypeLabel } from "@abonten/core/ticketTiers";
import Link from "next/link";
import {
  END_REASON,
  PART_REFUND,
  minor,
  planStatusBadge,
  refundBadge,
} from "../planStatus";
import { PlanActions } from "./PlanActions";

// One plan: its locked price, every part with its provider reference and
// refund, and what staff can do — end it with its refund, or deal with a
// refund share the provider refused or never confirmed.

const englishTier = (key: string) =>
  key === "ticketTiers.freeName"
    ? "Free"
    : key === "ticketTiers.singleName"
      ? "Standard ticket"
      : key;

export default async function TicketPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermissionPage("plans.view");
  const { id } = await params;
  const { ctx, detail } = await loadTicketPlanDetail(id);
  const plan = detail.data;
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;

  if (detail.status !== 200 || !plan) {
    return (
      <div>
        <PageHeader title="Plan" />
        <EmptyState>{detail.message ?? "Couldn't load the plan."}</EmptyState>
      </div>
    );
  }

  const open = ["awaiting_payment", "active", "settling"].includes(plan.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={plan.eventTitle || "Plan"}
        description={`Started ${timeAgo(plan.createdAt)} by ${plan.username ? `@${plan.username}` : plan.userId}.`}
      />

      <div className="flex flex-wrap gap-2">
        {planStatusBadge(plan.status)}
        {refundBadge(plan.refundStatus)}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-2 p-4 text-sm">
          <p className="font-semibold">Price (locked when the plan started)</p>
          {plan.lines.map((l) => (
            <p key={l.ticketTypeId} className="flex justify-between gap-3">
              <span>
                {l.quantity} × {ticketTypeLabel(englishTier, l.tier)}
              </span>
              <span className="tabular-nums">
                {minor(l.amountMinor, plan.currency)}
              </span>
            </p>
          ))}
          <p className="flex justify-between gap-3 text-muted-foreground">
            <span>Service fee</span>
            <span className="tabular-nums">
              {minor(plan.feeMinor, plan.currency)}
            </span>
          </p>
          {plan.taxMinor > 0 ? (
            <p className="flex justify-between gap-3 text-muted-foreground">
              <span>Tax</span>
              <span className="tabular-nums">
                {minor(plan.taxMinor, plan.currency)}
              </span>
            </p>
          ) : null}
          <p className="flex justify-between gap-3 border-t border-border pt-2 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">
              {minor(plan.totalMinor, plan.currency)}
            </span>
          </p>
          <p className="flex justify-between gap-3">
            <span>Paid</span>
            <span className="tabular-nums">
              {minor(plan.paidMinor, plan.currency)}
            </span>
          </p>
        </Card>

        <Card className="space-y-1 p-4 text-sm">
          <p className="font-semibold">Dates and terms</p>
          <p>
            Event starts: {formatOpsDateTime(plan.eventStartsAt)}{" "}
            {OPS_TIME_ZONE_LABEL}
          </p>
          <p>
            Deadline: {formatOpsDateTime(plan.deadlineAt)} {OPS_TIME_ZONE_LABEL}
          </p>
          {plan.status === "awaiting_payment" ? (
            <p>
              Hold ends: {formatOpsDateTime(plan.holdExpiresAt)}{" "}
              {OPS_TIME_ZONE_LABEL}
            </p>
          ) : null}
          <p>
            If it ends unfinished:{" "}
            {plan.keepFeeOnRefund
              ? "the ticket share comes back, the fee share is kept"
              : "everything paid comes back"}
          </p>
          {plan.endedReason ? (
            <p>
              Ended {plan.endedAt ? timeAgo(plan.endedAt) : ""}:{" "}
              {END_REASON[plan.endedReason]}
            </p>
          ) : null}
          {plan.refundMinor > 0 ? (
            <p>
              Refund: {minor(plan.refundMinor, plan.currency)}
              {plan.keptMinor > 0
                ? `, kept ${minor(plan.keptMinor, plan.currency)}`
                : ""}
            </p>
          ) : null}
          {plan.transactionId ? (
            <p>
              Purchase:{" "}
              <Link
                href={`/finance/transactions/${plan.transactionId}`}
                className="underline underline-offset-2"
              >
                transaction
              </Link>
              {plan.settlementStatus ? ` (${plan.settlementStatus})` : ""}
            </p>
          ) : plan.settlementStatus ? (
            <p>Settlement: {plan.settlementStatus}</p>
          ) : null}
          <p>
            <Link
              href={`/events/${plan.eventId}`}
              className="underline underline-offset-2"
            >
              Event
            </Link>
            {" · "}
            <Link
              href={`/users/${plan.userId}`}
              className="underline underline-offset-2"
            >
              Buyer
            </Link>
          </p>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Parts</h2>
        {plan.parts.length === 0 ? (
          <EmptyState>Nothing paid yet.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Paid</Th>
                <Th>Amount</Th>
                <Th>Provider reference</Th>
                <Th>Refund</Th>
                <Th>Refund state</Th>
              </tr>
            </thead>
            <tbody>
              {plan.parts.map((p) => (
                <tr key={p.id}>
                  <Td>{timeAgo(p.paidAt)}</Td>
                  <Td className="tabular-nums">
                    {minor(p.amountMinor, plan.currency)}
                    {p.method ? (
                      <span className="block text-xs text-muted-foreground">
                        {p.method}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="font-mono text-xs">
                    {p.provider} · {p.providerReference}
                  </Td>
                  <Td className="tabular-nums">
                    {p.refundMinor > 0
                      ? minor(p.refundMinor, plan.currency)
                      : "—"}
                  </Td>
                  <Td>
                    {PART_REFUND[p.refundStatus]}
                    {p.refundFailure ? (
                      <span className="block text-xs text-destructive">
                        {p.refundFailure}
                      </span>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <PlanActions
        planId={plan.id}
        open={open}
        parts={plan.parts}
        currency={plan.currency}
        canManage={ctx.permissions.includes("plans.manage")}
        stepUpFresh={stepUpFresh}
      />
    </div>
  );
}
