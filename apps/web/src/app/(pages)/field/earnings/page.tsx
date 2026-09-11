import { getMyFieldOpsEarnings } from "@/actions/fieldOps/getMyFieldOpsEarnings";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import StatTile from "@/fieldOps/atoms/StatTile";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import type { FieldOpsCommission } from "@abonten/types/fieldOps";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const money = (minor: number, currency: string) =>
  `${currency} ${(minor / 100).toFixed(2)}`;

const STATUS_COPY: Record<string, string> = {
  pending: "In holding",
  approved: "Ready to pay",
  in_payout: "In a payout",
  paid: "Paid",
  rejected: "Not eligible",
  reversed: "Taken back",
};

export default async function FieldEarningsPage() {
  const me = await loadFieldOpsMe();
  const current = me.data?.current;
  if (!current) notFound();

  const res = await getMyFieldOpsEarnings({ campaignId: current.campaign.id });
  const earnings = res.data;
  if (!earnings) notFound();

  const { totals, commissions } = earnings;
  // A reversal offset is shown beside the row it cancels, not on its own.
  const reversedIds = new Set(
    commissions
      .map((c) => c.reversesCommissionId)
      .filter((id): id is string => Boolean(id)),
  );
  const lines = commissions.filter((c) => !c.reversesCommissionId);

  const row = (c: FieldOpsCommission) => {
    const cancelled = c.status === "reversed" || reversedIds.has(c.id);
    return (
      <li key={c.id} className="rounded-xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            {c.onboardingId ? (
              <Link
                href={`/field/submissions/${c.onboardingId}`}
                className="font-medium hover:underline"
              >
                {c.businessName ?? "An onboarding"}
              </Link>
            ) : (
              <span className="font-medium">
                {c.activityKey.replace(/_/g, " ")}
              </span>
            )}
            <p className="text-sm text-muted-foreground">
              {STATUS_COPY[c.status] ?? c.status} ·{" "}
              {new Date(c.earnedAt).toLocaleDateString()}
            </p>
          </div>
          <span
            className={`tabular-nums font-semibold ${cancelled ? "text-muted-foreground line-through" : ""}`}
          >
            {money(c.amountMinor, c.currency)}
          </span>
        </div>
        {c.status === "rejected" && c.rejectionReason ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {c.rejectionReason}
          </p>
        ) : null}
        {c.status === "reversed" && c.reversalReason ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Taken back: {c.reversalReason}
          </p>
        ) : null}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>Earnings</PageTitle>
        <SupportingText>
          What you have earned on {earnings.campaign.name}.
          {earnings.liveRate
            ? ` You earn ${money(earnings.liveRate.amountMinor, earnings.liveRate.currency)} for each business that passes its checks.`
            : ""}
        </SupportingText>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="In holding"
          value={money(totals.pendingMinor, totals.currency)}
          hint={
            earnings.nextReleaseAt
              ? `next ${new Date(earnings.nextReleaseAt).toLocaleDateString()}`
              : undefined
          }
        />
        <StatTile
          label="Ready to pay"
          value={money(totals.approvedMinor, totals.currency)}
        />
        <StatTile
          label="In a payout"
          value={money(totals.inPayoutMinor, totals.currency)}
        />
        <StatTile
          label="Paid"
          value={money(totals.paidMinor, totals.currency)}
        />
      </div>

      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        A commission is confirmed after the holding period, once an automatic
        check confirms the business is still listed and owned by the owner who
        verified their phone. Payouts are made by the office; the payout details
        form arrives with the next release.
      </p>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Your commissions</h2>
        {lines.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Nothing yet. A commission appears here once your team lead verifies
            a business you onboarded.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">{lines.map(row)}</ul>
        )}
      </section>
    </div>
  );
}
