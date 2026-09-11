import { StepUpButton } from "@/components/StepUpButton";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
  timeAgo,
} from "@/components/ui";
import { loadRebates } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import type { AdminRebateRun } from "@abonten/types/rewards";
import Link from "next/link";
import { RewardEventTable, statusReason } from "../RewardEventTable";
import { RewardsTabs } from "../RewardsTabs";
import { RunRebatesForm } from "./RunRebatesForm";

const RULE_TITLES = {
  organizer_rebate: "Organizer rebate",
  venue_rebate: "Venue rebate",
  organizer_milestone: "Milestone",
  place_visits: "Place visits",
} as const;

const monthLabel = (period: string) =>
  new Date(`${period}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

// The last six months that have started (this month first).
function recentMonths(): { value: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
    );
    const value = d.toISOString().slice(0, 10);
    return {
      value,
      label: `${monthLabel(value)}${i === 0 ? " (so far)" : ""}`,
    };
  });
}

function runLine(run: AdminRebateRun): string {
  if (run.skipped) return "Nothing live, nothing decided";
  const parts = Object.entries(run.byRule).map(
    ([key, r]) =>
      `${RULE_TITLES[key as keyof typeof RULE_TITLES]}: ${r?.decided ?? 0} (${formatCredit(r?.amountMinor ?? 0)})`,
  );
  return parts.length > 0 ? parts.join(" · ") : "No new decisions";
}

// Monthly organizer / venue rebates and milestones: what each run decided,
// what they cost, and who earned most. Promotion credit only -- it can't be
// spent on tickets or withdrawn.
export default async function RebatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { ctx, summary, events } = await loadRebates({
    cursor: sp.cursor ?? null,
  });
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;
  const canConfigure = ctx.permissions.includes("rewards.configure");
  const s = summary.data;

  return (
    <div>
      <PageHeader
        title="Rebates"
        description="Each month (the 3rd, 03:00) organizers get promotion credit for events that ended the month before, venue owners for other organizers' events at their verified place, organizers a one-off milestone bonus, and verified places credit for the different people who checked in there (decided once the month is over). Event rebates are priced from the cash Abonten kept on each event's sales."
      />
      <RewardsTabs active="/rewards/rebates" />

      {summary.status !== 200 || !s ? (
        <EmptyState>
          {summary.message ?? "Couldn't load the rebates."}
        </EmptyState>
      ) : (
        <>
          <Card className="mb-4 flex flex-wrap items-start justify-between gap-3 p-4 text-sm">
            <div className="space-y-1">
              <div className="flex flex-wrap gap-1">
                {(Object.keys(RULE_TITLES) as (keyof typeof RULE_TITLES)[]).map(
                  (key) => (
                    <Badge
                      key={key}
                      tone={s.liveRules.includes(key) ? "success" : "neutral"}
                    >
                      {RULE_TITLES[key]}:{" "}
                      {s.liveRules.includes(key) ? "live" : "off"}
                    </Badge>
                  ),
                )}
                {s.shadowMode ? (
                  <Badge tone="warning">shadow mode</Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Switch rules on under{" "}
                <Link
                  href="/rewards/rules"
                  className="text-primary hover:underline"
                >
                  Reward rules
                </Link>
                .{" "}
                {s.shadowMode
                  ? "While shadow mode is on, runs record what they would pay and post nothing."
                  : ""}
              </p>
            </div>
            {canConfigure && !stepUpFresh ? (
              <div className="flex items-center gap-2 text-xs">
                Running a month needs a fresh identity check.
                <StepUpButton next="/rewards/rebates" />
              </div>
            ) : (
              <RunRebatesForm
                months={recentMonths()}
                editable={canConfigure && stepUpFresh}
                shadow={s.shadowMode}
              />
            )}
          </Card>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(RULE_TITLES) as (keyof typeof RULE_TITLES)[]).map(
              (key) => {
                const r = s.byRule[key];
                return (
                  <Stat
                    key={key}
                    label={`${RULE_TITLES[key]} (last ${s.sinceDays} days)`}
                    value={formatCredit(r?.amountMinor ?? 0)}
                    hint={`${r?.count ?? 0} paid or pending · ${r?.rejected ?? 0} refused${
                      r?.shadowAmountMinor
                        ? ` · ${formatCredit(r.shadowAmountMinor)} in shadow`
                        : ""
                    }`}
                  />
                );
              },
            )}
            <Stat
              label="Cash net revenue behind them"
              value={formatCredit(s.netRevenueMinor)}
              hint="What Abonten kept on the counted sales (fee minus Paystack)."
            />
          </div>

          <div className="mb-4 grid gap-3 lg:grid-cols-2">
            <Card className="p-4">
              <p className="mb-2 text-sm font-semibold">
                Top earners (live and shadow)
              </p>
              {s.top.length === 0 ? (
                <p className="text-sm text-muted-foreground">None yet.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {s.top.map((t) => (
                    <li
                      key={`${t.userId}:${t.kind}`}
                      className="flex justify-between gap-2"
                    >
                      <Link
                        href={`/rewards/accounts/${t.userId}`}
                        className="truncate text-primary hover:underline"
                      >
                        {t.name ?? `${t.userId.slice(0, 8)}…`}
                      </Link>
                      <span className="whitespace-nowrap tabular-nums">
                        {t.kind} · {t.events}{" "}
                        {t.kind === "visits"
                          ? t.events === 1
                            ? "month"
                            : "months"
                          : t.events === 1
                            ? "event"
                            : "events"}{" "}
                        · {formatCredit(t.amountMinor)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-4">
              <p className="mb-2 text-sm font-semibold">
                Why events got nothing
              </p>
              {s.rejectReasons.length === 0 ? (
                <p className="text-sm text-muted-foreground">None.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {s.rejectReasons.map((r) => (
                    <li key={r.reason} className="flex justify-between gap-2">
                      <span>{statusReason(r.reason)}</span>
                      <span className="tabular-nums">{r.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
            Runs
          </h3>
          {s.runs.length === 0 ? (
            <EmptyState>No runs yet. The first one is on the 3rd.</EmptyState>
          ) : (
            <div className="mb-6">
              <Table>
                <thead>
                  <tr>
                    <Th>Month</Th>
                    <Th>Run</Th>
                    <Th>Events</Th>
                    <Th>Decided</Th>
                  </tr>
                </thead>
                <tbody>
                  {s.runs.map((run) => (
                    <tr key={run.id} className="align-top">
                      <Td className="whitespace-nowrap">
                        {monthLabel(run.periodStart)}
                      </Td>
                      <Td className="text-xs text-muted-foreground">
                        {timeAgo(run.startedAt)} ·{" "}
                        {run.triggeredBy
                          ? `by ${run.triggeredBy}`
                          : "scheduled"}
                        {run.shadowMode ? " · shadow" : ""}
                      </Td>
                      <Td className="tabular-nums">
                        {run.events}
                        {run.places > 0 ? (
                          <div className="text-xs text-muted-foreground">
                            + {run.places} place{run.places === 1 ? "" : "s"}
                          </div>
                        ) : null}
                        {run.errors > 0 ? (
                          <div className="text-xs text-destructive">
                            {run.errors} failed: {run.lastError}
                          </div>
                        ) : null}
                      </Td>
                      <Td className="text-xs">{runLine(run)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
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
          No rebate decisions yet. They appear after a run once a rebate rule is
          live and an event with paid sales has ended.
        </EmptyState>
      ) : (
        <>
          <RewardEventTable events={events.data} />
          {events.hasNextPage && events.nextCursor ? (
            <Link
              href={`/rewards/rebates?cursor=${encodeURIComponent(events.nextCursor)}`}
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
