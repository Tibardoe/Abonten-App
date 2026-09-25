import { CapNotice } from "@/components/metrics/CapNotice";
import { MetricCard } from "@/components/metrics/MetricCard";
import { RangeCaption, RangePicker } from "@/components/metrics/RangePicker";
import { SectionHeading } from "@/components/metrics/SectionHeading";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { loadReferrals } from "@/lib/data";
import { minorToMajor } from "@/lib/moneyUnits";
import {
  adminRangeQuery,
  parseAdminRangeParams,
} from "@abonten/core/admin/adminDateRange";
import { statusMeta } from "@abonten/core/admin/statusLabels";
import { formatMinor } from "@abonten/core/content/campaignMoney";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import { riskFlagLabel } from "@abonten/core/rewards/riskScore";
import type { RewardEventStatus } from "@abonten/types/rewards";
import Link from "next/link";
import { RewardEventTable } from "../RewardEventTable";
import { RewardsTabs } from "../RewardsTabs";

const STATUSES: RewardEventStatus[] = [
  "pending",
  "held",
  "released",
  "voided",
  "rejected",
  "deferred",
  "clawed_back",
];

// Credit amounts arrive in pesewas; the metric tiles take major units.

// Event referrals and friend invites: what the engine decided and what it
// would cost, over the console's shared period (whole calendar days, today
// included). While shadow mode is on every decision here is a projection:
// nothing was paid.
export default async function ReferralsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as RewardEventStatus)
    ? (sp.status as RewardEventStatus)
    : undefined;
  const mode = sp.mode === "shadow" || sp.mode === "live" ? sp.mode : undefined;
  const range = parseAdminRangeParams(sp);
  const { summary, events } = await loadReferrals(
    { status, mode, cursor: sp.cursor ?? null },
    range,
  );

  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams(adminRangeQuery(range));
    if (status) p.set("status", status);
    if (mode) p.set("mode", mode);
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `?${p.toString()}`;
  };

  const s = summary.data;
  const count = (st: RewardEventStatus) => s?.byStatus[st]?.count ?? 0;
  const amount = (st: RewardEventStatus) => s?.byStatus[st]?.amountMinor ?? 0;
  const projected = amount("pending") + amount("held") + amount("released");
  const friendQualified = s
    ? (s.friend.byPath.first_order ?? 0) +
      (s.friend.byPath.organizer_sales ?? 0) +
      (s.friend.byPath.place_claim ?? 0)
    : 0;
  const inviterRewards = s
    ? (s.friend.byStatus.pending?.amountMinor ?? 0) +
      (s.friend.byStatus.held?.amountMinor ?? 0) +
      (s.friend.byStatus.released?.amountMinor ?? 0)
    : 0;

  return (
    <div>
      <PageHeader
        title="Referrals"
        description="Every referred ticket sale and friend invite the reward engine evaluated. In shadow mode these are projections: no credit was posted and nobody was told."
        actions={
          <RangePicker
            basePath="/rewards/referrals"
            range={range}
            preserve={{ status, mode }}
          />
        }
      />
      <RewardsTabs active="/rewards/referrals" />
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
              noun="reward decisions"
            />
          ) : null}

          <section className="mb-4">
            <SectionHeading
              title="Event referrals"
              tip={{
                text: "Someone shares an event link with their referral code; if a friend buys through it, the event-referral rule decides a reward for the sharer.",
              }}
            />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard
                metric="referrals.linkVisits"
                value={s.touches}
                period={range.label}
                secondary={`${s.attributedCheckouts.toLocaleString("en-GB")} referred paid checkout${s.attributedCheckouts === 1 ? "" : "s"}`}
              />
              <MetricCard
                metric="referrals.referredTicketSales"
                value={minorToMajor(s.referredTicketRevenueMinor, s.currency)}
                format="money"
                period={range.label}
                secondary={`Abonten's net revenue on them: ${formatCredit(s.referredNetRevenueMinor, s.currency)}`}
              />
              <MetricCard
                metric="referrals.rewards"
                value={minorToMajor(projected, s.currency)}
                format="money"
                period={range.label}
                secondary={`${count("pending")} pending · ${count("held")} held · ${count("released")} released`}
              />
              <MetricCard
                metric="referrals.costShare"
                value={
                  s.projectedCostShareBps === null
                    ? null
                    : s.projectedCostShareBps / 10_000
                }
                format="percent"
                period={range.label}
                state={s.projectedCostShareBps === null ? "no-data" : undefined}
                stateNote="No referred net revenue in this period"
                tone={
                  s.projectedCostShareBps !== null &&
                  s.projectedCostShareBps > 3500
                    ? "danger"
                    : undefined
                }
              />
            </div>
          </section>

          <div className="mb-4 grid gap-3 lg:grid-cols-3">
            <Card className="p-4">
              <p className="mb-2 text-sm font-semibold">
                Not paid · {range.label.toLowerCase()}
              </p>
              <ul className="space-y-1 text-sm">
                {(
                  ["rejected", "voided", "deferred", "clawed_back"] as const
                ).map((st) => (
                  <li key={st} className="flex justify-between gap-2">
                    <span>
                      {statusMeta("rewardEvent", st).label}
                      {statusMeta("rewardEvent", st).description ? (
                        <span className="block text-xs text-muted-foreground">
                          {statusMeta("rewardEvent", st).description}
                        </span>
                      ) : null}
                    </span>
                    <span className="tabular-nums">{count(st)}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-4">
              <p className="mb-2 text-sm font-semibold">Risk flags raised</p>
              {s.riskFlags.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  None in {range.label.toLowerCase()}.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {s.riskFlags.map((f) => (
                    <li key={f.flag} className="flex justify-between gap-2">
                      <span>{riskFlagLabel(f.flag)}</span>
                      <span className="tabular-nums">{f.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-4">
              <p className="mb-2 text-sm font-semibold">Top referrers</p>
              {s.topReferrers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  None in {range.label.toLowerCase()}.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {s.topReferrers.map((r) => (
                    <li key={r.userId} className="flex justify-between gap-2">
                      <Link
                        href={`/rewards/accounts/${r.userId}`}
                        className="truncate text-primary hover:underline"
                      >
                        {r.name ?? `${r.userId.slice(0, 8)}…`}
                      </Link>
                      <span className="whitespace-nowrap tabular-nums">
                        {r.rewards} · {formatCredit(r.amountMinor, s.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <section className="mb-4">
            <SectionHeading
              title="Friend invites"
              tip={{
                text: "Someone invites a friend with their code or link. The friend gets welcome credit after their first order; the inviter gets a reward when the friend first buys, sells a ticket on their own event, or has a place claim approved.",
              }}
            />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard
                metric="referrals.friendsJoined"
                value={s.friend.joined}
                period={range.label}
              />
              <MetricCard
                metric="referrals.friendsQualified"
                value={friendQualified}
                period={range.label}
                secondary={`${s.friend.byPath.first_order ?? 0} first order · ${s.friend.byPath.organizer_sales ?? 0} own event sold · ${s.friend.byPath.place_claim ?? 0} place claim`}
              />
              <MetricCard
                metric="referrals.inviterRewards"
                value={minorToMajor(inviterRewards, s.currency)}
                format="money"
                period={range.label}
                secondary={`${s.friend.byStatus.rejected?.count ?? 0} refused · ${s.friend.byStatus.voided?.count ?? 0} voided`}
              />
              <MetricCard
                metric="referrals.welcomeCredit"
                value={minorToMajor(s.friend.welcome.amountMinor, s.currency)}
                format="money"
                period={range.label}
                secondary={`${s.friend.welcome.granted} friend${s.friend.welcome.granted === 1 ? "" : "s"} · ${s.friend.welcome.rejected} refused (already bought or same device)`}
              />
            </div>
          </section>

          {s.engine.deadLetters > 0 ||
          s.engine.settlementBacklog > 0 ||
          s.engine.outboxLagSeconds > 600 ? (
            <Card className="mb-4 border-destructive/40 p-3 text-sm text-destructive">
              The reward engine is behind: {s.engine.outboxLagSeconds}s outbox
              lag, {s.engine.settlementBacklog} overdue settlements,{" "}
              {s.engine.deadLetters} failed events. See Monitoring.
            </Card>
          ) : null}
        </>
      )}

      <SectionHeading title="Decisions" />
      <form
        className="mb-3 flex flex-wrap items-end gap-2"
        action="/rewards/referrals"
      >
        {range.key !== "custom" ? (
          <input type="hidden" name="range" value={range.key} />
        ) : (
          <>
            <input type="hidden" name="range" value="custom" />
            <input type="hidden" name="from" value={range.from.slice(0, 10)} />
            <input
              type="hidden"
              name="to"
              value={new Date(new Date(range.to).getTime() - 1)
                .toISOString()
                .slice(0, 10)}
            />
          </>
        )}
        <label className="text-xs text-muted-foreground">
          Status
          <select
            name="status"
            defaultValue={status ?? ""}
            className="mt-1 block rounded border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Any</option>
            {STATUSES.map((st) => (
              <option key={st} value={st}>
                {statusMeta("rewardEvent", st).label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Mode
          <select
            name="mode"
            defaultValue={mode ?? ""}
            className="mt-1 block rounded border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Shadow and live</option>
            <option value="shadow">Shadow only</option>
            <option value="live">Live only</option>
          </select>
        </label>
        <button
          type="submit"
          className="h-9 rounded-md border border-border bg-card px-3 text-sm hover:bg-muted"
        >
          Filter
        </button>
      </form>

      {events.status !== 200 ? (
        <EmptyState>
          {events.message ?? "Couldn't load the decisions."}
        </EmptyState>
      ) : events.data.length === 0 ? (
        <EmptyState>
          No referral decisions yet. They appear here once referral capture is
          on, a referral rule is live, and someone buys through a shared link or
          joins with an invite.
        </EmptyState>
      ) : (
        <>
          <RewardEventTable events={events.data} />
          {events.hasNextPage && events.nextCursor ? (
            <Link
              href={`/rewards/referrals${qs({ cursor: events.nextCursor })}`}
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
