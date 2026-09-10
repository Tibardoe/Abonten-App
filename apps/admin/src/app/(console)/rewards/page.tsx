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
  cn,
  timeAgo,
} from "@/components/ui";
import { loadRewardsOverview } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import type { CreditJournalType } from "@abonten/types/rewards";
import Link from "next/link";
import { AdjustmentDecision } from "./AdjustmentDecision";
import { RewardsTabs } from "./RewardsTabs";

const RANGES = [
  { key: "today", label: "Today", days: 0 },
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
] as const;

// Accra is UTC+0 all year, so UTC day boundaries are local ones.
function rangeBounds(key: string): { from: string; to: string } {
  const range = RANGES.find((r) => r.key === key) ?? RANGES[2];
  const to = new Date();
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  if (range.days > 0) from.setUTCDate(from.getUTCDate() - range.days + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

const FLOW_LABEL: Partial<Record<CreditJournalType, string>> = {
  "reward.accrue": "Rewards earned (pending)",
  "reward.release": "Rewards released",
  "reward.void": "Pending rewards voided",
  "reward.clawback": "Rewards clawed back",
  "bonus.grant": "Bonus & goodwill granted",
  "adjust.credit": "Manual credit added",
  "adjust.debit": "Manual credit removed",
  "redeem.capture": "Spent",
  "redeem.refund": "Returned by refunds",
  expire: "Expired",
  "withdraw.complete": "Withdrawn",
};

const RULE_LABEL: Record<string, string> = {
  event_referral: "Event referral",
  friend_referral_referrer: "Friend referral (referrer)",
  friend_referral_referee: "Friend referral (welcome)",
  organizer_rebate: "Organizer growth rebate",
  venue_rebate: "Venue rebate",
  organizer_milestone: "Organizer milestone",
};

function ruleTerms(r: {
  rateBps: number | null;
  netShareCapBps: number | null;
  flatMinor: number | null;
  minBasisMinor: number;
}): string {
  const parts: string[] = [];
  if (r.rateBps != null)
    parts.push(`${(r.rateBps / 100).toFixed(2)}% of ticket value`);
  if (r.flatMinor != null) parts.push(formatCredit(r.flatMinor));
  if (r.netShareCapBps != null)
    parts.push(
      r.rateBps != null
        ? `max ${(r.netShareCapBps / 100).toFixed(0)}% of net revenue`
        : `${(r.netShareCapBps / 100).toFixed(0)}% of net revenue`,
    );
  if (r.minBasisMinor > 0)
    parts.push(`min order ${formatCredit(r.minBasisMinor)}`);
  return parts.join(" · ");
}

export default async function RewardsOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const rangeKey: string = RANGES.find((r) => r.key === sp.range)?.key ?? "30d";
  const { ctx, overview, pending } = await loadRewardsOverview(
    rangeBounds(rangeKey),
  );
  const canAdjust = ctx.permissions.includes("finance.adjust");
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;

  return (
    <div>
      <PageHeader
        title="Rewards"
        description="Abonten Credit: outstanding liability, credit movement and ledger health."
        actions={
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <Link
                key={r.key}
                href={`/rewards?range=${r.key}`}
                className={cn(
                  "rounded px-2 py-1 text-xs",
                  rangeKey === r.key
                    ? "bg-primary text-primary-foreground"
                    : "border border-border hover:bg-muted",
                )}
              >
                {r.label}
              </Link>
            ))}
          </div>
        }
      />
      <RewardsTabs active="/rewards" />

      {overview.status !== 200 || !overview.data ? (
        <EmptyState>
          {overview.message ?? "Couldn't load the rewards overview."}
        </EmptyState>
      ) : (
        <>
          {(() => {
            const s = overview.data.settings;
            return (
              <Card className="mb-4 flex flex-wrap items-center gap-2 p-3 text-xs">
                <span className="font-semibold">Program</span>
                <Badge tone={s.rewardsEnabled ? "success" : "neutral"}>
                  {s.rewardsEnabled ? `On · ${s.audience}` : "Off"}
                </Badge>
                <Badge tone={s.shadowMode ? "warning" : "neutral"}>
                  {s.shadowMode ? "Shadow mode" : "Posting live"}
                </Badge>
                <Badge tone={s.redeemPromotionsEnabled ? "success" : "neutral"}>
                  Spend on promotions {s.redeemPromotionsEnabled ? "on" : "off"}
                </Badge>
                <Badge tone={s.redeemTicketsEnabled ? "success" : "neutral"}>
                  Spend on tickets {s.redeemTicketsEnabled ? "on" : "off"}
                </Badge>
                <Badge tone="neutral">Withdrawals off (version 1)</Badge>
                <Link
                  href="/rewards/settings"
                  className="ml-auto text-primary hover:underline"
                >
                  Change settings →
                </Link>
              </Card>
            );
          })()}

          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
            Outstanding credit (right now)
          </h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat
              label="Available to spend"
              value={formatCredit(overview.data.balances.availableMinor)}
              hint={`${overview.data.balances.accounts} accounts`}
            />
            <Stat
              label="Of which promotion-only"
              value={formatCredit(overview.data.promotionOnlyMinor)}
              hint="≈ no cash cost to Abonten"
            />
            <Stat
              label="Pending (contingent)"
              value={formatCredit(overview.data.balances.pendingMinor)}
              hint="not yet spendable"
            />
            <Stat
              label="On hold"
              value={formatCredit(
                overview.data.balances.reservedMinor +
                  overview.data.balances.frozenMinor +
                  overview.data.balances.withdrawingMinor,
              )}
              hint="reserved at checkout or frozen"
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <Stat
              label="Frozen accounts"
              value={overview.data.balances.frozenAccounts}
              tone={
                overview.data.balances.frozenAccounts > 0
                  ? "warning"
                  : undefined
              }
              href="/rewards/accounts?status=frozen"
            />
            <Stat
              label="Accounts in debt"
              value={overview.data.balances.inDebtAccounts}
              hint={formatCredit(overview.data.balances.debtMinor)}
              tone={
                overview.data.balances.inDebtAccounts > 0
                  ? "warning"
                  : undefined
              }
            />
            <Stat
              label="Open payment disputes"
              value={overview.data.openDisputes}
              tone={overview.data.openDisputes > 0 ? "danger" : undefined}
              href="/monitoring"
            />
            <Stat
              label="Adjustments awaiting approval"
              value={overview.data.pendingAdjustments}
              tone={
                overview.data.pendingAdjustments > 0 ? "warning" : undefined
              }
            />
          </div>

          <h3 className="mb-2 mt-5 text-sm font-semibold text-muted-foreground">
            Credit movement in this range
          </h3>
          {Object.keys(overview.data.flows).length === 0 ? (
            <EmptyState>No credit moved in this range.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Movement</Th>
                  <Th className="text-right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(overview.data.flows)
                  .filter(([type]) => FLOW_LABEL[type as CreditJournalType])
                  .map(([type, amount]) => (
                    <tr key={type}>
                      <Td>{FLOW_LABEL[type as CreditJournalType]}</Td>
                      <Td className="text-right tabular-nums">
                        {formatCredit(amount ?? 0)}
                      </Td>
                    </tr>
                  ))}
              </tbody>
            </Table>
          )}

          <h3 className="mb-2 mt-5 text-sm font-semibold text-muted-foreground">
            Ledger health
          </h3>
          {(() => {
            const r = overview.data.reconciliation;
            const problems =
              r.unbalancedJournals +
              r.balanceCacheDrift +
              r.lotBucketDrift +
              r.lotInvalidState;
            return (
              <Card className="p-3 text-sm">
                {problems === 0 ? (
                  <p>
                    <Badge tone="success">Healthy</Badge>{" "}
                    <span className="text-muted-foreground">
                      Every journal balances, and every account and lot matches
                      the ledger (last 2 days, re-checked every 30 minutes).
                    </span>
                  </p>
                ) : (
                  <ul className="space-y-1">
                    <li>Unbalanced journals: {r.unbalancedJournals}</li>
                    <li>
                      Balances that differ from the ledger:{" "}
                      {r.balanceCacheDrift}
                    </li>
                    <li>
                      Accounts whose lots don't add up: {r.lotBucketDrift}
                    </li>
                    <li>Lots in an impossible state: {r.lotInvalidState}</li>
                    <li className="text-destructive">
                      An incident has been opened in Monitoring. Freeze affected
                      accounts before correcting anything.
                    </li>
                  </ul>
                )}
              </Card>
            );
          })()}

          <h3 className="mb-2 mt-5 text-sm font-semibold text-muted-foreground">
            Adjustments awaiting a second approver
          </h3>
          {!stepUpFresh && canAdjust ? (
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              Deciding needs a fresh identity check.
              <StepUpButton next="/rewards" />
            </div>
          ) : null}
          {pending.status !== 200 || !pending.data ? (
            <EmptyState>
              {pending.message ?? "Couldn't load pending adjustments."}
            </EmptyState>
          ) : pending.data.length === 0 ? (
            <EmptyState>Nothing waiting.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>User</Th>
                  <Th>Change</Th>
                  <Th>Reason</Th>
                  <Th>Requested</Th>
                  {canAdjust && <Th />}
                </tr>
              </thead>
              <tbody>
                {pending.data.map((a) => (
                  <tr key={a.id}>
                    <Td>
                      <Link
                        href={`/rewards/accounts/${a.userId}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {a.userName ?? `${a.userId.slice(0, 8)}…`}
                      </Link>
                    </Td>
                    <Td className="tabular-nums">
                      {a.direction === "credit" ? "+" : "−"}
                      {formatCredit(a.amountMinor)}
                    </Td>
                    <Td className="max-w-xs text-muted-foreground">
                      {a.reason}
                    </Td>
                    <Td className="whitespace-nowrap text-muted-foreground">
                      {a.requestedByName ?? "—"} · {timeAgo(a.requestedAt)}
                    </Td>
                    {canAdjust && (
                      <Td className="w-56">
                        <AdjustmentDecision
                          requestId={a.id}
                          isOwnRequest={a.requestedBy === ctx.userId}
                          canDecide={canAdjust}
                          stepUpFresh={stepUpFresh}
                        />
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          <h3 className="mb-2 mt-5 text-sm font-semibold text-muted-foreground">
            Reward rules
          </h3>
          <Table>
            <thead>
              <tr>
                <Th>Rule</Th>
                <Th>Version</Th>
                <Th>Terms</Th>
                <Th>Credit type</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {overview.data.rules.map((r) => (
                <tr key={r.id}>
                  <Td className="font-medium">
                    {RULE_LABEL[r.ruleKey] ?? r.ruleKey}
                  </Td>
                  <Td className="tabular-nums">v{r.version}</Td>
                  <Td className="text-muted-foreground">{ruleTerms(r)}</Td>
                  <Td className="text-muted-foreground">
                    {r.spendScope === "promotions"
                      ? "Promotion-only"
                      : r.spendScope === "first_order"
                        ? "First order only"
                        : "Any"}
                    {r.expiryDays ? ` · expires in ${r.expiryDays} days` : ""}
                  </Td>
                  <Td>
                    <Badge tone={r.isActive ? "success" : "neutral"}>
                      {r.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">
            Rules pay nothing until the reward engine ships (Phase 4); they are
            recorded here so every reward can point to the exact terms it was
            calculated under.
          </p>
        </>
      )}
    </div>
  );
}
