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
import { loadPayouts } from "@/lib/data";
import Link from "next/link";
import { FinanceTabs } from "../FinanceTabs";

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
  const res = await loadPayouts({
    status: sp.status || undefined,
    cursor: sp.cursor ?? null,
  });

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
