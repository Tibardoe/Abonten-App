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
import { loadTransactions } from "@/lib/data";
import Link from "next/link";
import { FinanceTabs } from "../FinanceTabs";

const STATUS_TABS = [
  { key: "", label: "All" },
  { key: "successful", label: "Successful" },
  { key: "refund_pending", label: "Refund pending" },
  { key: "refunded", label: "Refunded" },
];

function txTone(s: string) {
  return s === "refunded"
    ? "neutral"
    : s === "refund_pending"
      ? "warning"
      : s === "successful"
        ? "success"
        : "info";
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "";
  const q = sp.q ?? "";
  const res = await loadTransactions({
    status: status || undefined,
    search: q || undefined,
    cursor: sp.cursor ?? null,
  });

  return (
    <div>
      <PageHeader
        title="Transactions"
        description="Every customer payment, with its full Paystack trace on the detail page."
      />
      <FinanceTabs active="/finance/transactions" />

      <form className="mb-3 flex gap-2" action="/finance/transactions">
        <input
          name="q"
          defaultValue={q}
          placeholder="Paystack ref / email / name…"
          className="h-8 w-72 rounded border border-border bg-background px-2 text-sm"
        />
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <button
          type="submit"
          className="h-8 rounded border border-border px-2.5 text-xs hover:bg-muted"
        >
          Search
        </button>
      </form>

      <div className="mb-3 flex flex-wrap gap-1">
        {STATUS_TABS.map((t) => (
          <Link
            key={t.key}
            href={`/finance/transactions?status=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
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
        <EmptyState>{res.message ?? "Couldn't load transactions."}</EmptyState>
      ) : res.data.length === 0 ? (
        <EmptyState>No transactions match.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Reference</Th>
              <Th>Payer</Th>
              <Th>Amount</Th>
              <Th>Status</Th>
              <Th>Reason</Th>
              <Th>When</Th>
            </tr>
          </thead>
          <tbody>
            {res.data.map((t) => (
              <tr key={t.id} className="hover:bg-muted/40">
                <Td>
                  <Link
                    href={`/finance/transactions/${t.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {t.paystackReference ?? `${t.id.slice(0, 8)}…`}
                  </Link>
                </Td>
                <Td>
                  {t.payerName ?? "—"}
                  {t.payerEmail ? (
                    <div className="text-xs text-muted-foreground">
                      {t.payerEmail}
                    </div>
                  ) : null}
                </Td>
                <Td className="tabular-nums">{money(t.amount, t.currency)}</Td>
                <Td>
                  <Badge tone={txTone(t.status)}>
                    {t.status.replace("_", " ")}
                  </Badge>
                </Td>
                <Td className="max-w-[220px] truncate text-muted-foreground">
                  {t.reason ?? "—"}
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">
                  {timeAgo(t.createdAt)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {res.hasNextPage && res.nextCursor ? (
        <div className="mt-3">
          <Link
            href={`/finance/transactions?status=${status}&cursor=${encodeURIComponent(res.nextCursor)}`}
            className="text-sm text-primary hover:underline"
          >
            Next page →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
