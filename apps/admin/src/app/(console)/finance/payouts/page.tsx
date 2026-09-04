import {
  Badge,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  money,
  timeAgo,
} from "@/components/ui";
import { requireAdmin } from "@/lib/adminGuard";
import { loadPayouts } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import Link from "next/link";
import { FinanceTabs } from "../FinanceTabs";
import { PayoutRowActions } from "../PayoutRowActions";

function payoutTone(s: string) {
  return s === "paid" || s === "completed" || s === "succeeded"
    ? "success"
    : s === "failed"
      ? "danger"
      : "warning";
}

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const [ctx, res] = await Promise.all([
    requireAdmin(),
    loadPayouts({
      status: sp.status || undefined,
      cursor: sp.cursor ?? null,
    }),
  ]);
  const canManage = ctx.permissions.includes("finance.payout");
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;

  return (
    <div>
      <PageHeader
        title="Payouts"
        description="Organizer withdrawal requests and their processing state. Account numbers are masked."
      />
      <FinanceTabs active="/finance/payouts" />

      {res.status !== 200 ? (
        <EmptyState>{res.message ?? "Couldn't load payouts."}</EmptyState>
      ) : res.data.length === 0 ? (
        <EmptyState>No payout requests yet.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Organizer</Th>
              <Th>Amount</Th>
              <Th>Destination</Th>
              <Th>Status</Th>
              <Th>Requested</Th>
              <Th>Processed</Th>
              {canManage && <Th />}
            </tr>
          </thead>
          <tbody>
            {res.data.map((p) => (
              <tr key={p.id} className="hover:bg-muted/40">
                <Td>
                  <Link
                    href={`/finance/organizers/${p.organizerId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {p.organizerName ?? `${p.organizerId.slice(0, 8)}…`}
                  </Link>
                </Td>
                <Td className="tabular-nums">{money(p.amount, p.currency)}</Td>
                <Td className="text-muted-foreground">
                  {p.accountLabel ?? "—"}
                </Td>
                <Td>
                  <Badge tone={payoutTone(p.status)}>{p.status}</Badge>
                  {p.failureReason ? (
                    <div className="text-xs text-destructive">
                      {p.failureReason}
                    </div>
                  ) : null}
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">
                  {p.requestedAt ? timeAgo(p.requestedAt) : "—"}
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">
                  {p.processedAt ? timeAgo(p.processedAt) : "—"}
                </Td>
                {canManage && (
                  <Td>
                    {p.status === "processing" ? (
                      <PayoutRowActions
                        payoutId={p.id}
                        canManage={canManage}
                        stepUpFresh={stepUpFresh}
                      />
                    ) : null}
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {res.hasNextPage && res.nextCursor ? (
        <div className="mt-3">
          <Link
            href={`/finance/payouts?cursor=${encodeURIComponent(res.nextCursor)}`}
            className="text-sm text-primary hover:underline"
          >
            Next page →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
