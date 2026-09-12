import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { loadFieldOpsCampaignAnalytics } from "@/lib/data";
import Link from "next/link";
import { FieldOpsTabs } from "../../../FieldOpsTabs";
import { ExportTeamCsv } from "./ExportTeamCsv";

const money = (minor: number, currency: string) =>
  `${currency} ${(minor / 100).toFixed(2)}`;

/** Same plain-CSS bars the Analytics module uses; no chart library. */
function Bars({
  series,
  pick,
  label,
  currency,
}: {
  series: { day: string; [k: string]: string | number }[];
  pick: string;
  label: string;
  currency?: string;
}) {
  const max = Math.max(1, ...series.map((p) => Number(p[pick])));
  return (
    <Card className="p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex h-24 items-end gap-[2px] overflow-x-auto">
        {series.map((p) => {
          const v = Number(p[pick]);
          return (
            <div
              key={p.day}
              title={`${p.day}: ${currency ? money(v, currency) : v}`}
              className="w-2 shrink-0 rounded-t bg-primary/70"
              style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
            />
          );
        })}
      </div>
      <p className="mt-1 text-right text-[10px] text-muted-foreground">
        peak {currency ? money(max, currency) : max}
      </p>
    </Card>
  );
}

export default async function FieldOpsCampaignAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx, analytics } = await loadFieldOpsCampaignAnalytics(id);

  if (analytics.status !== 200 || !analytics.data) {
    return (
      <div>
        <PageHeader title="Field Ops - Campaign figures" />
        <FieldOpsTabs active="/field-ops/campaigns" />
        <EmptyState>{analytics.message ?? "Campaign not found."}</EmptyState>
      </div>
    );
  }
  const { campaign, stats, members, territories, daily } = analytics.data;
  const committed =
    stats.money.approved_minor +
    stats.money.in_payout_minor +
    stats.money.paid_minor;

  return (
    <div>
      <PageHeader
        title={`${campaign.name} - figures`}
        description="Counted live from the work itself. Nothing on this page can be typed in."
      />
      <FieldOpsTabs active="/field-ops/campaigns" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/field-ops/campaigns/${id}`}
          className="text-sm text-primary hover:underline"
        >
          ← Back to the campaign
        </Link>
        {ctx.permissions.includes("fieldops.view") ? (
          <div className="ml-auto">
            <ExportTeamCsv campaignId={id} />
          </div>
        ) : null}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Coverage"
          value={`${stats.territories.coveragePct}%`}
          hint={`${stats.territories.covered + stats.territories.completed} of ${stats.territories.total} towns`}
        />
        <Stat
          label="Listed and stood up"
          value={stats.onboardings.succeeded}
          hint={`${stats.onboardings.rejected} rejected · ${stats.onboardings.flagged} flagged`}
        />
        <Stat
          label="Committed"
          value={money(committed, stats.currency)}
          hint={`${money(stats.money.paid_minor, stats.currency)} paid`}
        />
        <Stat
          label="Cost per success"
          value={
            stats.costPerSuccessMinor === null
              ? "—"
              : money(stats.costPerSuccessMinor, stats.currency)
          }
          hint={
            stats.costPerSuccessMinor === null
              ? "nothing has succeeded yet"
              : "committed ÷ successes"
          }
        />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Bars series={daily} pick="submitted" label="Sent in, per day" />
        <Bars series={daily} pick="verified" label="Verified, per day" />
        <Bars series={daily} pick="succeeded" label="Stood up, per day" />
        <Bars
          series={daily}
          pick="earnedMinor"
          label="Earned, per day"
          currency={stats.currency}
        />
      </div>

      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
        The team
      </h2>
      <Table>
        <thead>
          <tr>
            <Th>Member</Th>
            <Th>Role</Th>
            <Th>Days out</Th>
            <Th>Found</Th>
            <Th>Sent in</Th>
            <Th>Stood up</Th>
            <Th>Rejected</Th>
            <Th>Content</Th>
            <Th>Earned</Th>
            <Th>Waits</Th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.memberId} className="hover:bg-muted/40">
              <Td>
                {m.fullName ?? m.memberId.slice(0, 8)}
                {m.status !== "active" ? (
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({m.status})
                  </span>
                ) : null}
              </Td>
              <Td className="capitalize">{m.role.replace(/_/g, " ")}</Td>
              <Td className="tabular-nums">{m.assignedDays}</Td>
              <Td className="tabular-nums">{m.prospects}</Td>
              <Td className="tabular-nums">{m.submitted}</Td>
              <Td className="tabular-nums">{m.succeeded}</Td>
              <Td className="tabular-nums">{m.rejected}</Td>
              <Td className="tabular-nums">{m.contentApproved}</Td>
              <Td className="whitespace-nowrap tabular-nums">
                {money(m.earnedMinor, stats.currency)}
              </Td>
              <Td className="tabular-nums text-muted-foreground">
                {m.medianReviewHours === null ? "—" : `${m.medianReviewHours}h`}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="mt-1 text-xs text-muted-foreground">
        &quot;Waits&quot; is how long that member&apos;s work typically sits
        before the lead reviews it — a lead problem, not a member one.
      </p>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-muted-foreground">
        Towns
      </h2>
      <Table>
        <thead>
          <tr>
            <Th>Town</Th>
            <Th>Covered</Th>
            <Th>Found</Th>
            <Th>Spoken to</Th>
            <Th>Sent in</Th>
            <Th>Listed</Th>
            <Th>Rejected</Th>
          </tr>
        </thead>
        <tbody>
          {territories.map((t) => (
            <tr key={t.territoryId} className="hover:bg-muted/40">
              <Td>{t.name}</Td>
              <Td>
                <Badge
                  tone={
                    t.status === "completed"
                      ? "success"
                      : t.covered
                        ? "info"
                        : "warning"
                  }
                >
                  {t.status === "completed"
                    ? "done"
                    : t.covered
                      ? "covered"
                      : "nobody there"}
                </Badge>
              </Td>
              <Td className="tabular-nums">{t.prospects}</Td>
              <Td className="tabular-nums">{t.contacted}</Td>
              <Td className="tabular-nums">{t.submitted}</Td>
              <Td className="tabular-nums">{t.succeeded}</Td>
              <Td className="tabular-nums">{t.rejected}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
