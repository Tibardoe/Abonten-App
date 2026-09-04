import {
  Badge,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  cn,
  money,
  timeAgo,
} from "@/components/ui";
import { loadRefunds } from "@/lib/data";
import Link from "next/link";
import { FinanceTabs } from "../FinanceTabs";

const TABS = [
  { key: "refund_pending", label: "Pending" },
  { key: "refunded", label: "Completed" },
  { key: "all", label: "All" },
];

export default async function RefundsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const status = (
    TABS.some((t) => t.key === sp.status) ? sp.status : "refund_pending"
  ) as "refund_pending" | "refunded" | "all";
  const res = await loadRefunds({ status, cursor: sp.cursor ?? null });

  return (
    <div>
      <PageHeader
        title="Refunds"
        description="Transactions with a refund requested or issued. The Abonten service fee is retained — only ticket revenue is refundable."
      />
      <FinanceTabs active="/finance/refunds" />

      <div className="mb-3 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/finance/refunds?status=${t.key}`}
            className={cn(
              "rounded px-2.5 py-1 text-xs",
              status === t.key
                ? "bg-primary text-primary-foreground"
                : "border border-border hover:bg-muted",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {res.status !== 200 ? (
        <EmptyState>{res.message ?? "Couldn't load refunds."}</EmptyState>
      ) : res.data.length === 0 ? (
        <EmptyState>No refunds in this view.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Reference</Th>
              <Th>Payer</Th>
              <Th>Charged</Th>
              <Th>Refundable</Th>
              <Th>Status</Th>
              <Th>Requested</Th>
            </tr>
          </thead>
          <tbody>
            {res.data.map((r) => (
              <tr key={r.transactionId} className="hover:bg-muted/40">
                <Td>
                  <Link
                    href={`/finance/transactions/${r.transactionId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {r.paystackReference ?? `${r.transactionId.slice(0, 8)}…`}
                  </Link>
                </Td>
                <Td>{r.payerName ?? "—"}</Td>
                <Td className="tabular-nums">{money(r.amount, r.currency)}</Td>
                <Td className="tabular-nums">
                  {money(r.refundableAmount, r.currency)}
                </Td>
                <Td>
                  <Badge tone={r.status === "refunded" ? "neutral" : "warning"}>
                    {r.status.replace("_", " ")}
                  </Badge>
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">
                  {r.refundRequestedAt ? timeAgo(r.refundRequestedAt) : "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {res.hasNextPage && res.nextCursor ? (
        <div className="mt-3">
          <Link
            href={`/finance/refunds?status=${status}&cursor=${encodeURIComponent(res.nextCursor)}`}
            className="text-sm text-primary hover:underline"
          >
            Next page →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
