import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Stat,
  money,
  timeAgo,
} from "@/components/ui";
import { requireAdmin } from "@/lib/adminGuard";
import { loadOrganizerFinance } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import Link from "next/link";
import { CreatePayoutPanel } from "../../CreatePayoutPanel";

function payoutTone(s: string) {
  return s === "paid" || s === "completed" || s === "succeeded"
    ? "success"
    : s === "failed"
      ? "danger"
      : "warning";
}

export default async function OrganizerFinancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [ctx, res] = await Promise.all([
    requireAdmin(),
    loadOrganizerFinance(id),
  ]);
  if (res.status !== 200 || !res.data) {
    return <EmptyState>{res.message ?? "Not found."}</EmptyState>;
  }
  const f = res.data;
  const canCreatePayout = ctx.permissions.includes("finance.payout");
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;

  return (
    <div>
      <PageHeader
        title={`Finance · ${f.organizerName ?? f.organizerId.slice(0, 8)}`}
        description={
          <span className="flex gap-3">
            <Link
              href={`/organizers/${f.organizerId}`}
              className="text-primary hover:underline"
            >
              ← Organizer profile
            </Link>
            <Link
              href="/finance/payouts"
              className="text-primary hover:underline"
            >
              All payouts
            </Link>
          </span>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Earned" value={money(f.earned, f.currency)} />
        <Stat
          label="Held"
          value={money(f.held, f.currency)}
          tone={f.held > 0 ? "warning" : undefined}
        />
        <Stat label="Paid out" value={money(f.paidOut, f.currency)} />
        <Stat
          label="Outstanding"
          value={money(f.outstanding, f.currency)}
          hint="earned − paid out − held"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold">
            Payout accounts ({f.payoutAccounts.length})
          </h3>
          {f.payoutAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">None on file.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {f.payoutAccounts.map((a) => (
                <li key={a.id} className="rounded border border-border p-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {a.provider ?? a.accountType ?? "account"}
                    </span>
                    {a.isDefault ? <Badge tone="info">default</Badge> : null}
                    {a.status ? (
                      <span className="text-xs text-muted-foreground">
                        {a.status}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {a.accountHolderName ?? "—"} · {a.maskedNumber ?? "••••"}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <CreatePayoutPanel
              organizerId={f.organizerId}
              currency={f.currency}
              outstandingLabel={money(f.outstanding, f.currency)}
              accounts={f.payoutAccounts}
              canCreate={canCreatePayout}
              stepUpFresh={stepUpFresh}
            />
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold">
            Recent payouts ({f.recentPayouts.length})
          </h3>
          {f.recentPayouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payout requests.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {f.recentPayouts.map((p) => (
                <li key={p.id} className="rounded bg-muted/50 p-2">
                  <div className="flex items-center justify-between">
                    <Badge tone={payoutTone(p.status)}>{p.status}</Badge>
                    <span className="tabular-nums">
                      {money(p.amount, p.currency)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.accountLabel ?? "—"} ·{" "}
                    {p.requestedAt ? timeAgo(p.requestedAt) : "—"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4 lg:col-span-2">
          <h3 className="mb-2 text-sm font-semibold">
            Recent ledger entries ({f.recentLedger.length})
          </h3>
          {f.recentLedger.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ledger activity.</p>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Gross</th>
                    <th className="px-3 py-2">Fee</th>
                    <th className="px-3 py-2">Paid out?</th>
                    <th className="px-3 py-2">When</th>
                  </tr>
                </thead>
                <tbody>
                  {f.recentLedger.map((l) => (
                    <tr key={l.id} className="border-b border-border">
                      <td className="px-3 py-2">{l.entryType}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {money(l.amount, l.currency)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {l.grossAmount != null
                          ? money(l.grossAmount, l.currency)
                          : "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {l.feeAmount != null
                          ? money(l.feeAmount, l.currency)
                          : "—"}
                      </td>
                      <td className="px-3 py-2">{l.payoutId ? "yes" : "no"}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {timeAgo(l.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </Card>
      </div>
    </div>
  );
}
