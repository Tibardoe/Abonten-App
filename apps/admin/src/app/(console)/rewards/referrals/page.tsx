import { Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { loadReferrals } from "@/lib/data";
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
const RANGES = [7, 30, 90];

// Event referrals and friend invites: what the engine decided and what it
// would cost. While shadow mode is on every decision here is a projection --
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
  const days = RANGES.includes(Number(sp.days)) ? Number(sp.days) : 30;
  const { summary, events } = await loadReferrals(
    { status, mode, cursor: sp.cursor ?? null },
    days,
  );

  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (mode) p.set("mode", mode);
    if (days !== 30) p.set("days", String(days));
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  const s = summary.data;
  const count = (st: RewardEventStatus) => s?.byStatus[st]?.count ?? 0;
  const amount = (st: RewardEventStatus) => s?.byStatus[st]?.amountMinor ?? 0;
  const projected = amount("pending") + amount("held") + amount("released");

  return (
    <div>
      <PageHeader
        title="Referrals"
        description="Every referred ticket sale and friend invite the reward engine evaluated. In shadow mode these are projections: no credit was posted and nobody was told."
      />
      <RewardsTabs active="/rewards/referrals" />

      <div className="mb-3 flex flex-wrap gap-1 text-xs">
        {RANGES.map((d) => (
          <Link
            key={d}
            href={`/rewards/referrals${qs({ days: d === 30 ? undefined : String(d), cursor: undefined })}`}
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
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Link visits"
              value={s.touches}
              hint={`${s.attributedCheckouts} paid checkouts came through a link`}
            />
            <Stat
              label="Referred ticket sales"
              value={formatCredit(s.referredTicketRevenueMinor)}
              hint={`Abonten net revenue on them: ${formatCredit(s.referredNetRevenueMinor)}`}
            />
            <Stat
              label="Rewards (pending + held + released)"
              value={formatCredit(projected)}
              hint={`${count("pending")} pending · ${count("held")} held · ${count("released")} released`}
            />
            <Stat
              label="Cost as a share of net revenue"
              value={
                s.projectedCostShareBps === null
                  ? "—"
                  : `${(s.projectedCostShareBps / 100).toFixed(1)}%`
              }
              hint="The rule caps each reward at 35% of its sale's net revenue."
              tone={
                s.projectedCostShareBps !== null &&
                s.projectedCostShareBps > 3500
                  ? "danger"
                  : undefined
              }
            />
          </div>

          <div className="mb-4 grid gap-3 lg:grid-cols-3">
            <Card className="p-4">
              <p className="mb-2 text-sm font-semibold">Not paid</p>
              <ul className="space-y-1 text-sm">
                <li className="flex justify-between">
                  <span>Rejected</span>
                  <span className="tabular-nums">{count("rejected")}</span>
                </li>
                <li className="flex justify-between">
                  <span>Voided (refund, cancellation, review)</span>
                  <span className="tabular-nums">{count("voided")}</span>
                </li>
                <li className="flex justify-between">
                  <span>Deferred (budget)</span>
                  <span className="tabular-nums">{count("deferred")}</span>
                </li>
                <li className="flex justify-between">
                  <span>Clawed back</span>
                  <span className="tabular-nums">{count("clawed_back")}</span>
                </li>
              </ul>
            </Card>
            <Card className="p-4">
              <p className="mb-2 text-sm font-semibold">Risk flags raised</p>
              {s.riskFlags.length === 0 ? (
                <p className="text-sm text-muted-foreground">None.</p>
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
                <p className="text-sm text-muted-foreground">None yet.</p>
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
                        {r.rewards} · {formatCredit(r.amountMinor)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
            Friend invites
          </h3>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Friends who joined with an invite"
              value={s.friend.joined}
            />
            <Stat
              label="Friends who qualified"
              value={
                (s.friend.byPath.first_order ?? 0) +
                (s.friend.byPath.organizer_sales ?? 0) +
                (s.friend.byPath.place_claim ?? 0)
              }
              hint={`${s.friend.byPath.first_order ?? 0} first order · ${s.friend.byPath.organizer_sales ?? 0} own event sold · ${s.friend.byPath.place_claim ?? 0} place claim`}
            />
            <Stat
              label="Inviter rewards (pending + held + released)"
              value={formatCredit(
                (s.friend.byStatus.pending?.amountMinor ?? 0) +
                  (s.friend.byStatus.held?.amountMinor ?? 0) +
                  (s.friend.byStatus.released?.amountMinor ?? 0),
              )}
              hint={`${s.friend.byStatus.rejected?.count ?? 0} rejected · ${s.friend.byStatus.voided?.count ?? 0} voided`}
            />
            <Stat
              label="Welcome credit granted"
              value={formatCredit(s.friend.welcome.amountMinor)}
              hint={`${s.friend.welcome.granted} friends · ${s.friend.welcome.rejected} refused (already bought or same device)`}
            />
          </div>

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

      <form
        className="mb-3 flex flex-wrap items-end gap-2"
        action="/rewards/referrals"
      >
        {days !== 30 ? <input type="hidden" name="days" value={days} /> : null}
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
                {st.replace("_", " ")}
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
