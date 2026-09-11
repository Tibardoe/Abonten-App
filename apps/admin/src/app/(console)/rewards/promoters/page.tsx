import { Badge, Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { loadPromoters } from "@/lib/data";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import type { RewardEventStatus } from "@abonten/types/rewards";
import Link from "next/link";
import { RewardEventTable } from "../RewardEventTable";
import { RewardsTabs } from "../RewardsTabs";

const RANGES = [7, 30, 90];

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
  const days = RANGES.includes(Number(sp.days)) ? Number(sp.days) : 30;
  const { summary, events } = await loadPromoters(
    { cursor: sp.cursor ?? null },
    days,
  );
  const s = summary.data;

  return (
    <div>
      <PageHeader
        title="Promoters & loyalty"
        description="Commissions organizers pay the people whose links sell their tickets (as Abonten Credit, charged to the organizer's payout, outside the reward budget), and the loyalty fee rebate: the service fee back on every 5th ticket order to a different event."
      />
      <RewardsTabs active="/rewards/promoters" />

      <div className="mb-3 flex flex-wrap gap-1 text-xs">
        {RANGES.map((d) => (
          <Link
            key={d}
            href={`/rewards/promoters${d === 30 ? "" : `?days=${d}`}`}
            className={
              d === days
                ? "rounded bg-primary px-2 py-1 text-primary-foreground"
                : "rounded border border-border px-2 py-1 hover:bg-muted"
            }
          >
            Last {d} days
          </Link>
        ))}
      </div>

      {summary.status !== 200 || !s ? (
        <EmptyState>
          {summary.message ?? "Couldn't load the summary."}
        </EmptyState>
      ) : (
        <>
          <Card className="mb-4 flex flex-wrap gap-1 p-4 text-sm">
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
            {s.shadowMode ? <Badge tone="warning">shadow mode</Badge> : null}
            <span className="ml-1 text-xs text-muted-foreground">
              Commissions also need “Capture referral links” on in Program
              settings.
            </span>
          </Card>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Events offering a commission"
              value={String(s.activeOffers)}
              hint="Right now."
            />
            <Stat
              label={`Promoter sales (last ${s.sinceDays} days)`}
              value={formatCredit(s.commission.revenueMinor)}
              hint={`${sum(s.commission.byStatus, ["pending", "held", "released"]).count} order(s) through promoters' links`}
            />
            <Stat
              label="Commission (pending + paid)"
              value={formatCredit(
                sum(s.commission.byStatus, ["pending", "held", "released"])
                  .amountMinor,
              )}
              hint={`${formatCredit(s.commission.organizerChargedMinor)} charged to organizers, net of what was given back${
                s.commission.shadow.count > 0
                  ? ` · ${formatCredit(s.commission.shadow.amountMinor)} in shadow`
                  : ""
              }`}
            />
            <Stat
              label="Loyalty fee rebates"
              value={formatCredit(
                sum(s.loyalty.byStatus, ["pending", "held", "released"])
                  .amountMinor,
              )}
              hint={`${sum(s.loyalty.byStatus, ["pending", "held", "released"]).count} order(s) · ${s.loyalty.byStatus.rejected?.count ?? 0} refused${
                s.loyalty.shadow.count > 0
                  ? ` · ${formatCredit(s.loyalty.shadow.amountMinor)} in shadow`
                  : ""
              }`}
            />
          </div>

          <Card className="mb-6 p-4">
            <p className="mb-2 text-sm font-semibold">Top promoters (live)</p>
            {s.topPromoters.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
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
                      {formatCredit(p.amountMinor)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
        Decisions
      </h3>
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
              href={`/rewards/promoters?cursor=${encodeURIComponent(events.nextCursor)}${days === 30 ? "" : `&days=${days}`}`}
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
