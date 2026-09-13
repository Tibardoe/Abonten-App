import { ChartCard } from "@/components/metrics/ChartCard";
import { MetricCard } from "@/components/metrics/MetricCard";
import { SectionHeading } from "@/components/metrics/SectionHeading";
import { TimeSeriesChart } from "@/components/metrics/charts/TimeSeriesChart";
import { Badge, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { loadFieldOpsCampaignAnalytics } from "@/lib/data";
import { formatAccraDate } from "@/lib/format";
import { describeSeries } from "@abonten/core/admin/describeSeries";
import type { FieldOpsDailyPoint } from "@abonten/types/fieldOps";
import Link from "next/link";
import { FieldOpsTabs } from "../../../FieldOpsTabs";
import { ExportTeamCsv } from "./ExportTeamCsv";

const cedis = (minor: number) => minor / 100;
const DAYS = 30;
const PERIOD = `Last ${DAYS} days`;

// One vocabulary for the state that matters most: an onboarding that passed
// every check is "succeeded" here, on the list, on the overview and in the
// glossary — not "listed", "stood up" or "successful" depending on the page.

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
        <PageHeader title="Field Ops · Campaign figures" />
        <FieldOpsTabs active="/field-ops/campaigns" />
        <EmptyState>{analytics.message ?? "Campaign not found."}</EmptyState>
      </div>
    );
  }
  const { campaign, stats, members, territories, daily } = analytics.data;
  const currency = stats.currency;
  const committed =
    stats.money.approved_minor +
    stats.money.in_payout_minor +
    stats.money.paid_minor;

  const chart = (
    title: string,
    pick: keyof Omit<FieldOpsDailyPoint, "day">,
    opts: { money?: boolean; definition?: string } = {},
  ) => {
    const points = daily.map((p) => ({
      bucketStart: `${p.day}T00:00:00Z`,
      value: opts.money ? cedis(Number(p[pick])) : Number(p[pick]),
    }));
    const total = points.reduce((n, p) => n + p.value, 0);
    return (
      <ChartCard
        title={title}
        unit={opts.money ? `${currency} per day` : "per day"}
        caption={`${PERIOD}, rolling to now`}
        definition={opts.definition ? { text: opts.definition } : undefined}
        state={total > 0 ? "ok" : "empty"}
        summary={describeSeries(points, {
          label: title,
          rangeLabel: PERIOD,
          formatBucket: formatAccraDate,
          format: opts.money ? (v) => `${currency} ${v.toFixed(2)}` : undefined,
        })}
        table={{
          caption: `${title} per day, ${PERIOD.toLowerCase()}`,
          columns: ["Day", title],
          rows: points.map((p) => [
            formatAccraDate(p.bucketStart),
            opts.money ? p.value.toFixed(2) : p.value,
          ]),
        }}
      >
        <TimeSeriesChart
          data={points.map((p) => ({
            label: formatAccraDate(p.bucketStart),
            value: p.value,
          }))}
          valueLabel={title}
          format={opts.money ? "money" : "count"}
          currency={currency}
          height={160}
        />
      </ChartCard>
    );
  };

  return (
    <div>
      <PageHeader
        title={`${campaign.name} · figures`}
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

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          metric="fieldOps.coverage"
          value={stats.territories.coveragePct / 100}
          format="percent"
          period="Right now"
          secondary={`${stats.territories.covered + stats.territories.completed} of ${stats.territories.total} towns`}
        />
        <MetricCard
          metric="fieldOps.succeeded"
          value={stats.onboardings.succeeded}
          period="All time"
          secondary={`${stats.onboardings.rejected} rejected · ${stats.onboardings.flagged} flagged`}
        />
        <MetricCard
          metric="fieldOps.committed"
          value={cedis(committed)}
          format="money"
          currency={currency}
          period="All time"
          secondary={`${currency} ${cedis(stats.money.paid_minor).toFixed(2)} of it paid`}
        />
        <MetricCard
          metric="fieldOps.costPerSuccess"
          value={
            stats.costPerSuccessMinor === null
              ? null
              : cedis(stats.costPerSuccessMinor)
          }
          format="money"
          currency={currency}
          period="All time"
          stateNote="Nothing has succeeded yet"
        />
      </div>

      <SectionHeading title="Per day" />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {chart("Sent in", "submitted", {
          definition:
            "Onboardings members submitted for their team lead's review that day.",
        })}
        {chart("Verified", "verified", {
          definition:
            "Onboardings the team lead verified that day; the holding period starts here.",
        })}
        {chart("Succeeded", "succeeded", {
          definition:
            "Onboardings whose every check passed that day, so the commission was approved.",
        })}
        {chart("Earned", "earnedMinor", {
          money: true,
          definition:
            "Commission amounts earned that day, at the rule version in force when the lead verified.",
        })}
      </div>

      <SectionHeading title="The team" />
      <Table>
        <thead>
          <tr>
            <Th>Member</Th>
            <Th>Role</Th>
            <Th>Days out</Th>
            <Th>Found</Th>
            <Th>Sent in</Th>
            <Th>Succeeded</Th>
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
                {currency} {cedis(m.earnedMinor).toFixed(2)}
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

      <SectionHeading title="Towns" className="mt-6" />
      <Table>
        <thead>
          <tr>
            <Th>Town</Th>
            <Th>Covered</Th>
            <Th>Found</Th>
            <Th>Spoken to</Th>
            <Th>Sent in</Th>
            <Th>Succeeded</Th>
            <Th>Rejected</Th>
          </tr>
        </thead>
        <tbody>
          {territories.map((t) => (
            <tr key={t.territoryId} className="hover:bg-muted/40">
              <Td>{t.name}</Td>
              <Td>
                {t.status === "completed" ? (
                  <Badge tone="success">Done</Badge>
                ) : t.covered ? (
                  <Badge tone="info">Covered</Badge>
                ) : (
                  <Badge tone="warning">Nobody there yet</Badge>
                )}
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
