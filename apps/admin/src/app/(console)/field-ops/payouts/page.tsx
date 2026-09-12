import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  cn,
  timeAgo,
} from "@/components/ui";
import { loadFieldOpsPayouts } from "@/lib/data";
import Link from "next/link";
import { FieldOpsTabs } from "../FieldOpsTabs";
import { BuildBatchForm } from "./BuildBatchForm";

export const payoutMoney = (minor: number, currency: string) =>
  `${currency} ${(minor / 100).toFixed(2)}`;

export function batchTone(s: string) {
  switch (s) {
    case "paid":
      return "success" as const;
    case "approved":
      return "info" as const;
    case "cancelled":
      return "danger" as const;
    default:
      return "warning" as const;
  }
}

export default async function FieldOpsPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { ctx, batches, campaigns, preview } = await loadFieldOpsPayouts({
    campaignId: sp.campaign || undefined,
    status: sp.status || undefined,
  });
  const canBuild = ctx.permissions.includes("fieldops.commissions.approve");
  // Narrowed once here so the refinement survives into the map callbacks.
  const previewData =
    preview && preview.status === 200 ? (preview.data ?? null) : null;
  const allCampaigns = campaigns.status === 200 ? (campaigns.data ?? []) : [];

  return (
    <div>
      <PageHeader
        title="Field Ops - Payouts"
        description="Approved commissions are grouped per member into a batch, a second admin approves it, the money is sent by mobile money, and each transfer's reference is recorded here."
      />
      <FieldOpsTabs active="/field-ops/payouts" />

      <form className="mb-4 flex flex-wrap items-center gap-1 text-xs">
        <select
          name="campaign"
          defaultValue={sp.campaign ?? ""}
          className="rounded border border-border bg-background px-2 py-1"
        >
          <option value="">Pick a campaign...</option>
          {allCampaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded border border-border px-2 py-1 hover:bg-muted"
        >
          Show
        </button>
      </form>

      {previewData ? (
        <Card className="mb-4 p-4">
          <h2 className="text-sm font-semibold">Next batch</h2>
          {previewData.openBatchId ? (
            <p className="mt-1 text-sm text-muted-foreground">
              This campaign already has a batch waiting.{" "}
              <Link
                href={`/field-ops/payouts/${previewData.openBatchId}`}
                className="text-primary hover:underline"
              >
                Open it
              </Link>{" "}
              to approve, pay or cancel it before building another.
            </p>
          ) : previewData.lines.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Nothing is ready to pay in this campaign.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                {previewData.lines.length} member
                {previewData.lines.length === 1 ? "" : "s"} -{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {payoutMoney(previewData.totalMinor, previewData.currency)}
                </span>
              </p>
              <Table>
                <thead>
                  <tr>
                    <Th>Member</Th>
                    <Th>Destination</Th>
                    <Th>Commissions</Th>
                    <Th>Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.lines.map((l) => (
                    <tr key={l.memberId}>
                      <Td>{l.memberName ?? l.memberId.slice(0, 8)}</Td>
                      <Td className="text-muted-foreground">
                        {l.destinationMasked}
                      </Td>
                      <Td>{l.commissionCount}</Td>
                      <Td className="tabular-nums">
                        {payoutMoney(l.amountMinor, previewData.currency)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {canBuild ? (
                <div className="mt-3">
                  <BuildBatchForm campaignId={sp.campaign as string} />
                </div>
              ) : null}
            </>
          )}

          {previewData.withoutDestination.length > 0 ? (
            <p className="mt-3 rounded border border-border bg-muted/40 p-2 text-xs">
              Left out because they have not given a mobile money number yet:{" "}
              {previewData.withoutDestination
                .map(
                  (w) =>
                    `${w.memberName ?? "a member"} (${payoutMoney(w.amountMinor, previewData.currency)})`,
                )
                .join(", ")}
              . Their money stays ready to pay and joins the next batch.
            </p>
          ) : null}
        </Card>
      ) : null}

      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
        Batches
      </h2>
      {batches.status !== 200 || !batches.data ? (
        <EmptyState>{batches.message ?? "Could not load batches."}</EmptyState>
      ) : batches.data.length === 0 ? (
        <EmptyState>No payout batches yet.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Batch</Th>
              <Th>Campaign</Th>
              <Th>Members</Th>
              <Th>Total</Th>
              <Th>Status</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody>
            {batches.data.map((b) => (
              <tr key={b.id} className="hover:bg-muted/40">
                <Td>
                  <Link
                    href={`/field-ops/payouts/${b.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {b.label}
                  </Link>
                </Td>
                <Td>{b.campaignName}</Td>
                <Td>{b.itemCount}</Td>
                <Td
                  className={cn(
                    "tabular-nums",
                    b.status === "cancelled" && "line-through",
                  )}
                >
                  {payoutMoney(b.totalMinor, b.currency)}
                </Td>
                <Td>
                  <Badge tone={batchTone(b.status)}>{b.status}</Badge>
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">
                  {timeAgo(b.createdAt)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
