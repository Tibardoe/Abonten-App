import { StatusBadge } from "@/components/metrics/StatusBadge";
import {
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  cn,
  money,
  timeAgo,
} from "@/components/ui";
import { loadPaymentAttempts } from "@/lib/data";
import type {
  PaymentAttemptListItem,
  PaymentAttemptStatusGroup,
} from "@abonten/types/adminTypes";
import Link from "next/link";
import { FinanceTabs } from "../FinanceTabs";

const GROUP_TABS: { key: PaymentAttemptStatusGroup | ""; label: string }[] = [
  { key: "", label: "All" },
  { key: "failed", label: "Failed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "open", label: "Not confirmed yet" },
  { key: "finishing", label: "Paid, not issued" },
  { key: "succeeded", label: "Paid" },
];

const GROUPS = new Set<string>(
  GROUP_TABS.map((t) => t.key).filter((k) => k !== ""),
);

const PURPOSE: Record<PaymentAttemptListItem["purpose"], string> = {
  tickets: "Tickets",
  ticket_plan: "Pay small small part",
  event_promotion: "Event promotion",
  place_promotion: "Place promotion",
  spotlight_promotion: "Spotlight promotion",
  other: "Other",
};

const METHOD: Record<string, string> = {
  card: "Card",
  mobile_money: "Mobile money",
  bank_transfer: "Bank transfer",
  ussd: "USSD",
};

export default async function PaymentAttemptsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const group = GROUPS.has(sp.group ?? "")
    ? (sp.group as PaymentAttemptStatusGroup)
    : undefined;
  const q = sp.q ?? "";
  const res = await loadPaymentAttempts({
    group,
    search: q || undefined,
    cursor: sp.cursor ?? null,
  });

  const href = (params: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
    const s = u.toString();
    return `/finance/attempts${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Payment attempts"
        description="Every try at paying, including the ones that never became a payment: declined, cancelled or never confirmed. Use it when someone says they paid but got nothing, or a payment keeps failing."
      />
      <FinanceTabs active="/finance/attempts" />

      <form className="mb-3 flex gap-2" action="/finance/attempts">
        <input
          name="q"
          defaultValue={q}
          placeholder="Provider ref / username / name…"
          className="h-8 w-72 rounded border border-border bg-background px-2 text-sm"
        />
        {group ? <input type="hidden" name="group" value={group} /> : null}
        <button
          type="submit"
          className="h-8 rounded border border-border px-2.5 text-xs hover:bg-muted"
        >
          Search
        </button>
      </form>

      <div className="mb-3 flex flex-wrap gap-1">
        {GROUP_TABS.map((t) => (
          <Link
            key={t.key}
            href={href({ group: t.key || undefined, q: q || undefined })}
            className={cn(
              "rounded px-2.5 py-1 text-xs",
              (group ?? "") === t.key
                ? "bg-primary text-primary-foreground"
                : "border border-border hover:bg-muted",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {res.status !== 200 ? (
        <EmptyState>
          {res.message ?? "Couldn't load payment attempts."}
        </EmptyState>
      ) : res.data.length === 0 ? (
        <EmptyState>No payment attempts match.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Buyer</Th>
              <Th>For</Th>
              <Th>Amount</Th>
              <Th>Method</Th>
              <Th>Status</Th>
              <Th>Reason / reference</Th>
            </tr>
          </thead>
          <tbody>
            {res.data.map((a) => (
              <tr key={a.id} className="align-top hover:bg-muted/40">
                <Td className="whitespace-nowrap text-muted-foreground">
                  {timeAgo(a.createdAt)}
                </Td>
                <Td>
                  <Link
                    href={`/users/${a.buyerId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {a.buyerName ||
                      a.buyerUsername ||
                      `${a.buyerId.slice(0, 8)}…`}
                  </Link>
                  {a.buyerUsername && a.buyerName ? (
                    <div className="text-xs text-muted-foreground">
                      @{a.buyerUsername}
                    </div>
                  ) : null}
                </Td>
                <Td>
                  {a.orderTitle ?? PURPOSE[a.purpose]}
                  <div className="text-xs text-muted-foreground">
                    {PURPOSE[a.purpose]}
                    {a.ticketCount ? ` · ${a.ticketCount}` : ""}
                  </div>
                </Td>
                <Td className="tabular-nums">{money(a.amount, a.currency)}</Td>
                <Td className="whitespace-nowrap">
                  {a.method ? (METHOD[a.method] ?? a.method) : "—"}
                  {a.provider ? (
                    <div className="text-xs text-muted-foreground">
                      {a.provider}
                      {a.mode ? ` · ${a.mode}` : ""}
                    </div>
                  ) : null}
                </Td>
                <Td>
                  <StatusBadge family="paymentAttempt" value={a.status} />
                </Td>
                <Td className="max-w-[320px]">
                  {a.failureReason ? (
                    <div className="text-xs">{a.failureReason}</div>
                  ) : null}
                  {a.transactionId ? (
                    <Link
                      href={`/finance/transactions/${a.transactionId}`}
                      className="text-xs text-primary hover:underline"
                    >
                      {a.providerReference ?? "Open payment"}
                    </Link>
                  ) : (
                    <div className="break-all text-xs text-muted-foreground">
                      {a.providerReference ?? "—"}
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {res.hasNextPage && res.nextCursor ? (
        <div className="mt-3">
          <Link
            href={href({
              group,
              q: q || undefined,
              cursor: res.nextCursor,
            })}
            className="text-sm text-primary hover:underline"
          >
            Next page →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
