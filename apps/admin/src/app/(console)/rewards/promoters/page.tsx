import { CapNotice } from "@/components/metrics/CapNotice";
import { MetricCard } from "@/components/metrics/MetricCard";
import { RangeCaption, RangePicker } from "@/components/metrics/RangePicker";
import { SectionHeading } from "@/components/metrics/SectionHeading";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { loadPromoters } from "@/lib/data";
import { minorToMajor } from "@/lib/moneyUnits";
import {
  adminRangeQuery,
  parseAdminRangeParams,
} from "@abonten/core/admin/adminDateRange";
import { formatMinor } from "@abonten/core/content/campaignMoney";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import type { RewardEventStatus } from "@abonten/types/rewards";
import Link from "next/link";
import { RewardEventTable } from "../RewardEventTable";
import { RewardsTabs } from "../RewardsTabs";

type Buckets = Partial<
  Record<RewardEventStatus, { count: number; amountMinor: number }>
>;
const sum = (b: Buckets, statuses: RewardEventStatus[]) =>
  statuses.reduce(
    (acc, s) => ({
      count: acc.count + (b[s]?.count ?? 0),
      amountMinor: acc.amountMinor + (b[s]?.amountMinor ?? 0),
    }),
    { count: 0, amountMinor: 0 },
  );

// Rewards Phase 8's per-sale rewards: commissions organizers pay promoters
// (in Abonten Credit, charged to the organizer's payout) and the loyalty fee
// rebate (every 5th ticket order on a different event). Visits live on the
// Rebates page with the other monthly rewards.
export default async function PromotersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const range = parseAdminRangeParams(sp);
  const { summary, events } = await loadPromoters(
    { cursor: sp.cursor ?? null },
    range,
  );
  const s = summary.data;
  const decided = (b: Buckets) => sum(b, ["pending", "held", "released"]);

  return (
    <div>
      <PageHeader
        title="Promoters & loyalty"
        description="Commissions organizers pay the people whose links sell their tickets (as Abonten Credit, charged to the organizer's payout, outside the reward budget), and the loyalty fee rebate: the service fee back on every 5th ticket order to a different event."
        actions={<RangePicker basePath="/rewards/promoters" range={range} />}
      />
      <RewardsTabs active="/rewards/promoters" />
      <RangeCaption range={range} className="mb-3" />

      {summary.status !== 200 || !s ? (
        <EmptyState>
          {summary.message ?? "Couldn't load the summary."}
        </EmptyState>
      ) : (
        <>
          {s.truncated ? (
            <CapNotice
              className="mb-3"
              fetched={s.truncated.fetched}
              total={s.truncated.total}
              noun="decisions and ledger entries"
            />
          ) : null}

          <Card className="mb-4 flex flex-wrap items-center gap-1 p-4 text-sm">
            <Badge
              tone={
                s.liveRules.includes("promoter_commission")
                  ? "success"
                  : "neutral"
              }
            >
              Promoter commission:{" "}
              {s.liveRules.includes("promoter_commission") ? "live" : "off"}
            </Badge>
            <Badge
              tone={
                s.liveRules.includes("loyalty_fee_rebate")
                  ? "success"
                  : "neutral"
              }
            >
              Loyalty fee rebate:{" "}
              {s.liveRules.includes("loyalty_fee_rebate") ? "live" : "off"}
            </Badge>
            {s.shadowMode ? <Badge tone="warning">Shadow mode</Badge> : null}
            <span className="ml-1 text-xs text-muted-foreground">
              Commissions also need “Capture referral links” on in Programme
              settings.
            </span>
          </Card>

          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              metric="promoters.activeOffers"
              value={s.activeOffers}
              period="Right now"
            />
            <MetricCard
              metric="promoters.sales"
              value={minorToMajor(s.commission.revenueMinor, s.currency)}
              format="money"
              period={range.label}
              secondary={`${decided(s.commission.byStatus).count} order${decided(s.commission.byStatus).count === 1 ? "" : "s"} through promoters' links`}
            />
            <MetricCard
              metric="promoters.commission"
              value={minorToMajor(
                decided(s.commission.byStatus).amountMinor,
                s.currency,
              )}
              format="money"
              period={range.label}
              secondary={`${formatCredit(s.commission.organizerChargedMinor, s.currency)} charged to organizers, net of what was given back${
                s.commission.shadow.count > 0
                  ? ` · ${formatCredit(s.commission.shadow.amountMinor, s.currency)} in shadow`
                  : ""
              }`}
            />
            <MetricCard
              metric="loyalty.feeRebates"
              value={minorToMajor(
                decided(s.loyalty.byStatus).amountMinor,
                s.currency,
              )}
              format="money"
              period={range.label}
              secondary={`${decided(s.loyalty.byStatus).count} order${decided(s.loyalty.byStatus).count === 1 ? "" : "s"} · ${s.loyalty.byStatus.rejected?.count ?? 0} refused${
                s.loyalty.shadow.count > 0
                  ? ` · ${formatCredit(s.loyalty.shadow.amountMinor, s.currency)} in shadow`
                  : ""
              }`}
            />
          </div>

          <Card className="mb-6 p-4">
            <p className="mb-2 text-sm font-semibold">
              Top promoters (live) · {range.label.toLowerCase()}
            </p>
            {s.topPromoters.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                None in {range.label.toLowerCase()}.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {s.topPromoters.map((p) => (
                  <li key={p.userId} className="flex justify-between gap-2">
                    <Link
                      href={`/rewards/accounts/${p.userId}`}
                      className="truncate text-primary hover:underline"
                    >
                      {p.name ?? `${p.userId.slice(0, 8)}…`}
                    </Link>
                    <span className="whitespace-nowrap tabular-nums">
                      {p.sales} order{p.sales === 1 ? "" : "s"} ·{" "}
                      {formatCredit(p.amountMinor, s.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      <SectionHeading title="Decisions" />
      {events.status !== 200 ? (
        <EmptyState>
          {events.message ?? "Couldn't load the decisions."}
        </EmptyState>
      ) : events.data.length === 0 ? (
        <EmptyState>
          No decisions yet. They appear when a ticket is sold through a link on
          an event with a commission, or someone buys their 5th ticket order.
        </EmptyState>
      ) : (
        <>
          <RewardEventTable events={events.data} />
          {events.hasNextPage && events.nextCursor ? (
            <Link
              href={`/rewards/promoters?cursor=${encodeURIComponent(events.nextCursor)}&${adminRangeQuery(range)}`}
              className="mt-3 inline-block text-sm text-primary hover:underline"
            >
              Older →
            </Link>
          ) : null}
        </>
      )}
    </div>
  );
}
