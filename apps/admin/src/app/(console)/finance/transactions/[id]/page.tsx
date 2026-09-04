import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Stat,
  money,
  timeAgo,
} from "@/components/ui";
import { loadTransactionDetail } from "@/lib/data";
import Link from "next/link";

function txTone(s: string) {
  return s === "refunded"
    ? "neutral"
    : s === "refund_pending"
      ? "warning"
      : s === "successful"
        ? "success"
        : "info";
}
function attemptTone(s: string) {
  return s === "succeeded"
    ? "success"
    : s === "failed" || s === "cancelled"
      ? "danger"
      : "info";
}

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await loadTransactionDetail(id);
  if (res.status !== 200 || !res.data) {
    return <EmptyState>{res.message ?? "Transaction not found."}</EmptyState>;
  }
  const t = res.data;

  return (
    <div>
      <PageHeader
        title={`Transaction · ${t.paystackReference ?? t.id.slice(0, 8)}`}
        description={
          <Link
            href="/finance/transactions"
            className="text-primary hover:underline"
          >
            ← Back to transactions
          </Link>
        }
        actions={
          <Badge tone={txTone(t.status)}>{t.status.replace("_", " ")}</Badge>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Amount charged" value={money(t.amount, t.currency)} />
        <Stat
          label="Refundable now"
          value={money(t.refundableAmount, t.currency)}
          hint="ticket revenue only — fee retained"
        />
        <Stat label="Attempts" value={t.attempts.length} />
        <Stat label="Tickets issued" value={t.ticketsIssued} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold">Payment</h3>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Payer</dt>
            <dd>
              {t.payerName ?? "—"}
              {t.userId ? (
                <>
                  {" "}
                  <Link
                    href={`/users/${t.userId}`}
                    className="text-primary hover:underline"
                  >
                    (account)
                  </Link>
                </>
              ) : null}
            </dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd>{t.payerEmail ?? "(hidden)"}</dd>
            <dt className="text-muted-foreground">Phone</dt>
            <dd>{t.payerPhone ?? "(hidden)"}</dd>
            <dt className="text-muted-foreground">Method</dt>
            <dd>{t.paymentMethod ?? "—"}</dd>
            <dt className="text-muted-foreground">Paystack ref</dt>
            <dd className="break-all">{t.paystackReference ?? "—"}</dd>
            <dt className="text-muted-foreground">Reason</dt>
            <dd>{t.reason ?? "—"}</dd>
            <dt className="text-muted-foreground">Created</dt>
            <dd>{new Date(t.createdAt).toLocaleString()}</dd>
            {t.refundRequestedAt ? (
              <>
                <dt className="text-muted-foreground">Refund requested</dt>
                <dd>{new Date(t.refundRequestedAt).toLocaleString()}</dd>
              </>
            ) : null}
          </dl>
          {t.gatewayResponse ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Gateway response
              </summary>
              <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted/50 p-2 text-xs">
                {t.gatewayResponse}
              </pre>
            </details>
          ) : null}
          {t.metadata ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Metadata
              </summary>
              <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted/50 p-2 text-xs">
                {JSON.stringify(t.metadata, null, 2)}
              </pre>
            </details>
          ) : null}
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold">
            Payment attempts ({t.attempts.length})
          </h3>
          {t.attempts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No attempts recorded.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {t.attempts.map((a) => (
                <li key={a.id} className="rounded border border-border p-2">
                  <div className="flex items-center justify-between">
                    <Badge tone={attemptTone(a.status)}>{a.status}</Badge>
                    <span className="tabular-nums">
                      {money(a.amount, a.currency)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.provider ?? "?"} · {a.providerReference ?? "no ref"} ·{" "}
                    {timeAgo(a.createdAt)}
                  </p>
                  {a.failureReason ? (
                    <p className="mt-1 text-xs text-destructive">
                      {a.failureReason}
                    </p>
                  ) : null}
                  {a.paidAt ? (
                    <p className="text-xs text-muted-foreground">
                      paid {new Date(a.paidAt).toLocaleString()}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold">
            Platform fee entries ({t.feeEntries.length})
          </h3>
          {t.feeEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">None.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {t.feeEntries.map((f) => (
                <li key={f.id} className="rounded bg-muted/50 p-2">
                  <p className="font-medium">{f.entryType}</p>
                  <p className="text-xs text-muted-foreground">
                    customer {money(f.totalCustomerPayment ?? 0, f.currency)} ·
                    ticket {money(f.ticketRevenue ?? 0, f.currency)} · fee{" "}
                    {money(f.serviceFee ?? 0, f.currency)} · cost{" "}
                    {money(f.processingCost ?? 0, f.currency)} · net{" "}
                    {money(f.netRevenue ?? 0, f.currency)}
                    {f.feeRate != null
                      ? ` · rate ${(f.feeRate * 100).toFixed(1)}%`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold">
            Organizer ledger ({t.ledgerEntries.length})
          </h3>
          {t.ledgerEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">None.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {t.ledgerEntries.map((l) => (
                <li key={l.id} className="rounded bg-muted/50 p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{l.entryType}</span>
                    <span className="tabular-nums">
                      {money(l.amount, l.currency)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {l.organizerId ? (
                      <Link
                        href={`/finance/organizers/${l.organizerId}`}
                        className="text-primary hover:underline"
                      >
                        {l.organizerName ?? `${l.organizerId.slice(0, 8)}…`}
                      </Link>
                    ) : (
                      "—"
                    )}
                    {l.grossAmount != null
                      ? ` · gross ${money(l.grossAmount, l.currency)}`
                      : ""}
                    {l.feeAmount != null
                      ? ` · fee ${money(l.feeAmount, l.currency)}`
                      : ""}
                    {l.payoutId ? " · in a payout" : " · not yet paid out"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {t.checkouts.length > 0 && (
          <Card className="p-4 lg:col-span-2">
            <h3 className="mb-2 text-sm font-semibold">
              Checkouts ({t.checkouts.length})
            </h3>
            <ul className="space-y-1 text-sm">
              {t.checkouts.map((c) => (
                <li key={c.id}>
                  {c.eventId ? (
                    <Link
                      href={`/events/${c.eventId}`}
                      className="text-primary hover:underline"
                    >
                      event
                    </Link>
                  ) : (
                    c.kind
                  )}{" "}
                  · qty {c.quantity ?? "?"} · total{" "}
                  {money(c.totalPrice ?? 0, t.currency)}
                  {c.discount ? ` · disc ${money(c.discount, t.currency)}` : ""}
                  {c.promoCode ? ` · promo ${c.promoCode}` : ""} ·{" "}
                  <span className="text-muted-foreground">
                    {c.status ?? "?"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
