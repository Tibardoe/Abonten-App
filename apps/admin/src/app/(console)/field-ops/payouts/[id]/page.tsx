import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
  cn,
} from "@/components/ui";
import { loadFieldOpsPayoutBatch } from "@/lib/data";
import { FieldOpsTabs } from "../../FieldOpsTabs";
import { batchTone, payoutMoney } from "../page";
import { BatchActions, ItemActions } from "./BatchActions";

export default async function FieldOpsPayoutBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx, detail } = await loadFieldOpsPayoutBatch(id);

  if (detail.status !== 200 || !detail.data) {
    return (
      <div>
        <PageHeader title="Field Ops - Payout batch" />
        <FieldOpsTabs active="/field-ops/payouts" />
        <EmptyState>{detail.message ?? "Batch not found."}</EmptyState>
      </div>
    );
  }
  const { batch, items, canApprove } = detail.data;
  const canPay = ctx.permissions.includes("fieldops.commissions.pay");
  const canManage = ctx.permissions.includes("fieldops.commissions.approve");
  const paid = items.filter((i) => i.status === "paid");
  const pending = items.filter((i) => i.status === "pending");

  return (
    <div>
      <PageHeader
        title={`${batch.label} - ${batch.campaignName}`}
        description={
          batch.status === "draft"
            ? "Built and waiting for a second admin to approve it. Nothing has been sent."
            : batch.status === "approved"
              ? "Approved. Send each transfer by mobile money, then record its reference here."
              : batch.status === "paid"
                ? "Every transfer in this batch has been recorded."
                : "Cancelled. The commissions went back into the pool."
        }
      />
      <FieldOpsTabs active="/field-ops/payouts" />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat
          label="Total"
          value={payoutMoney(batch.totalMinor, batch.currency)}
        />
        <Stat label="Members" value={batch.itemCount} />
        <Stat
          label="Paid"
          value={`${paid.length}/${items.length}`}
          hint={payoutMoney(
            paid.reduce((t, i) => t + i.amountMinor, 0),
            batch.currency,
          )}
        />
        <Stat
          label="Status"
          value={<Badge tone={batchTone(batch.status)}>{batch.status}</Badge>}
        />
      </div>

      {canManage || canPay ? (
        <div className="mb-4">
          <BatchActions
            batchId={batch.id}
            status={batch.status}
            canApprove={canApprove && canManage}
            canCancel={canManage && pending.length === items.length}
            canExport={canPay && ctx.permissions.includes("users.view_pii")}
          />
        </div>
      ) : null}

      <Card className="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Member</Th>
              <Th>Send to</Th>
              <Th>Commissions</Th>
              <Th>Amount</Th>
              <Th>Status</Th>
              <Th>Reference</Th>
              {canPay && batch.status === "approved" ? <Th>Record</Th> : null}
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="align-top hover:bg-muted/40">
                <Td>{i.memberName ?? i.memberUserId.slice(0, 8)}</Td>
                <Td>
                  <div>{i.destination.network ?? "MoMo"}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {i.destination.number ?? i.destination.numberMasked}
                  </div>
                  {i.destination.holderName ? (
                    <div className="text-xs text-muted-foreground">
                      {i.destination.holderName}
                    </div>
                  ) : null}
                </Td>
                <Td>{i.commissionCount}</Td>
                <Td className="whitespace-nowrap tabular-nums">
                  {payoutMoney(i.amountMinor, i.currency)}
                </Td>
                <Td>
                  <Badge
                    tone={
                      i.status === "paid"
                        ? "success"
                        : i.status === "failed"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {i.status}
                  </Badge>
                </Td>
                <Td
                  className={cn(
                    "text-xs",
                    !i.paymentReference && "text-muted-foreground",
                  )}
                >
                  {i.paymentReference ?? i.failureReason ?? "-"}
                </Td>
                {canPay && batch.status === "approved" ? (
                  <Td>
                    {i.status === "pending" ? (
                      <ItemActions itemId={i.id} />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        done
                      </span>
                    )}
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {batch.status === "approved" && pending.length > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Send each transfer from the mobile money account, then record its
          reference. A failed transfer puts that member&apos;s money back into
          the pool for the next batch. The batch closes itself once nothing is
          still pending.
        </p>
      ) : null}
    </div>
  );
}
