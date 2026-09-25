import { StatusBadge } from "@/components/metrics/StatusBadge";
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
import { loadOrphanCaptures, loadRefunds } from "@/lib/data";
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
  const [res, orphans] = await Promise.all([
    loadRefunds({ status, cursor: sp.cursor ?? null }),
    loadOrphanCaptures(),
  ]);

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
                    {r.providerReference ?? `${r.transactionId.slice(0, 8)}…`}
                  </Link>
                </Td>
                <Td>{r.payerName ?? "—"}</Td>
                <Td className="tabular-nums">{money(r.amount, r.currency)}</Td>
                <Td className="tabular-nums">
                  {money(r.refundableAmount, r.currency)}
                </Td>
                <Td>
                  <StatusBadge family="transaction" value={r.status} />
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

      <section className="mt-8">
        <h2 className="mb-1 text-sm font-semibold">Charges with no order</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Money a provider took after its payment had closed (a late mobile
          money approval, a stale payment page, a wrong amount). Nothing was
          issued for it and the full amount is refunded automatically; a row
          stuck on “refund failed” needs a manual refund in the provider’s
          dashboard.
        </p>
        {orphans.status !== 200 || !orphans.data ? (
          <EmptyState>{orphans.message ?? "Couldn't load them."}</EmptyState>
        ) : orphans.data.length === 0 ? (
          <EmptyState>None.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Market</Th>
                <Th>Amount</Th>
                <Th>Status</Th>
                <Th>Why</Th>
                <Th>Detected</Th>
              </tr>
            </thead>
            <tbody>
              {orphans.data.map((o) => (
                <tr key={o.id}>
                  <Td className="font-mono text-xs">{o.providerReference}</Td>
                  <Td>
                    {o.provider} · {o.countryCode}
                  </Td>
                  <Td className="tabular-nums">
                    {money(o.amount, o.currency)}
                  </Td>
                  <Td>
                    <Badge
                      tone={
                        o.status === "refund_failed"
                          ? "danger"
                          : o.status === "refunded"
                            ? "success"
                            : "warning"
                      }
                    >
                      {o.status.replace(/_/g, " ")}
                    </Badge>
                    {o.lastError ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {o.lastError}
                      </p>
                    ) : null}
                  </Td>
                  <Td className="text-xs text-muted-foreground">
                    {o.note ?? "—"}
                  </Td>
                  <Td className="whitespace-nowrap text-muted-foreground">
                    {timeAgo(o.detectedAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
