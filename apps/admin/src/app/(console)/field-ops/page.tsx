import { MetricCard } from "@/components/metrics/MetricCard";
import { SectionHeading } from "@/components/metrics/SectionHeading";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  money,
  timeAgo,
} from "@/components/ui";
import { loadFieldOpsOverview } from "@/lib/data";
import { CAMPAIGN_STATUS_LABEL } from "@abonten/core/fieldOps/campaignLifecycle";
import type { FieldOpsCampaignStatus } from "@abonten/types/fieldOps";
import Link from "next/link";
import { FieldOpsTabs } from "./FieldOpsTabs";

// Commission amounts are minor units; the tiles take major units.
const cedis = (minor: number) => minor / 100;

export function campaignStatusTone(status: FieldOpsCampaignStatus) {
  switch (status) {
    case "active":
      return "success" as const;
    case "paused":
    case "winding_down":
      return "warning" as const;
    case "draft":
      return "info" as const;
    default:
      return "neutral" as const;
  }
}

// The programme at a glance. Every tile is a standing figure ("Right now" or
// "All time"): there is no period here, and the money is summed in SQL per
// currency rather than in the browser under a row cap.
export default async function FieldOpsOverviewPage() {
  const { overview } = await loadFieldOpsOverview();

  return (
    <div>
      <PageHeader
        title="Field Ops"
        description="The regional promotion programme: teams onboarding businesses and organizers, region by region."
      />
      <FieldOpsTabs active="/field-ops" />

      {overview.status !== 200 || !overview.data ? (
        <EmptyState>
          {overview.message ?? "Couldn't load the Field Ops overview."}
        </EmptyState>
      ) : (
        <>
          {(() => {
            const d = overview.data;
            const s = d.settings;
            const live = d.campaigns.filter((c) =>
              ["active", "paused", "winding_down"].includes(c.status),
            );
            const m = d.money;
            return (
              <>
                <Card className="mb-4 flex flex-wrap items-center gap-2 p-3 text-xs">
                  <span className="font-semibold">Programme</span>
                  <Badge tone={s.programEnabled ? "success" : "neutral"}>
                    {s.programEnabled ? "On" : "Off"}
                  </Badge>
                  {d.killSwitchOn ? (
                    <Badge tone="danger">
                      Kill switch set on this deployment
                    </Badge>
                  ) : null}
                  <Badge tone="neutral">
                    {d.liveRuleCount} live commission{" "}
                    {d.liveRuleCount === 1 ? "rule" : "rules"}
                  </Badge>
                  <Badge tone="neutral">
                    Holding period {s.defaultHoldingDays} days
                  </Badge>
                  <Link
                    href="/field-ops/settings"
                    className="ml-auto text-primary hover:underline"
                  >
                    Change settings →
                  </Link>
                </Card>

                <section className="mb-4">
                  <SectionHeading title="Teams and territory" />
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <MetricCard
                      metric="fieldOps.liveCampaigns"
                      value={live.length}
                      period="Right now"
                      href="/field-ops/campaigns?status=live"
                    />
                    <MetricCard
                      metric="fieldOps.activeMembers"
                      value={live.reduce((n, c) => n + c.activeMemberCount, 0)}
                      period="Right now"
                      secondary="Across live campaigns"
                    />
                    <MetricCard
                      metric="fieldOps.regions"
                      value={d.regionCount}
                      period="Right now"
                      href="/field-ops/regions"
                    />
                    <MetricCard
                      metric="fieldOps.territories"
                      value={d.territoryCount}
                      period="Right now"
                    />
                  </div>
                </section>

                <section className="mb-4">
                  <SectionHeading title="Needs a person" />
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <MetricCard
                      metric="fieldOps.awaitingLead"
                      value={d.awaitingReview}
                      period="Right now"
                      href="/field-ops/onboardings?status=submitted"
                      tone={d.awaitingReview > 0 ? "warning" : undefined}
                    />
                    <MetricCard
                      metric="fieldOps.awaitingAdmin"
                      value={d.flagged}
                      period="Right now"
                      href="/field-ops/review"
                      tone={d.flagged > 0 ? "warning" : undefined}
                    />
                    <MetricCard
                      metric="fieldOps.succeeded"
                      value={d.succeeded}
                      period="All time"
                      href="/field-ops/onboardings?status=succeeded"
                    />
                  </div>
                </section>

                <section className="mb-4">
                  <SectionHeading
                    title={`Money · ${m.currency}`}
                    tip={{
                      label: "Commission money",
                      text: "What the programme owes its members and what it has paid, summed from every commission on record. A reversal is a negative row, so paid is net of reversals.",
                    }}
                  />
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <MetricCard
                      metric="fieldOps.inHolding"
                      value={cedis(m.pendingMinor)}
                      format="money"
                      currency={m.currency}
                      period="Right now"
                      href="/field-ops/commissions?status=pending"
                    />
                    <MetricCard
                      metric="fieldOps.readyToPay"
                      value={cedis(m.approvedMinor)}
                      format="money"
                      currency={m.currency}
                      period="Right now"
                      href="/field-ops/commissions?status=approved"
                    />
                    <MetricCard
                      metric="fieldOps.inPayoutBatch"
                      value={cedis(m.inPayoutMinor)}
                      format="money"
                      currency={m.currency}
                      period="Right now"
                      href="/field-ops/commissions?status=in_payout"
                    />
                    <MetricCard
                      metric="fieldOps.paid"
                      value={cedis(m.paidMinor)}
                      format="money"
                      currency={m.currency}
                      period="All time"
                      href="/field-ops/commissions?status=paid"
                      secondary={`From ${m.rows.toLocaleString("en-GH")} commission${m.rows === 1 ? "" : "s"} on record`}
                    />
                  </div>
                  {m.otherCurrencies.length > 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Other currencies, kept apart:{" "}
                      {m.otherCurrencies
                        .map(
                          (o) =>
                            `${o.currency} — in holding ${money(cedis(o.pendingMinor), o.currency)}, ready ${money(cedis(o.approvedMinor), o.currency)}, in a batch ${money(cedis(o.inPayoutMinor), o.currency)}, paid ${money(cedis(o.paidMinor), o.currency)}`,
                        )
                        .join(" · ")}
                    </p>
                  ) : null}
                </section>

                <SectionHeading title="Campaigns" />
                {d.campaigns.length === 0 ? (
                  <EmptyState>
                    No campaigns yet.{" "}
                    <Link
                      href="/field-ops/campaigns"
                      className="text-primary hover:underline"
                    >
                      Create the first one
                    </Link>{" "}
                    once a region and its territories exist.
                  </EmptyState>
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <Th>Campaign</Th>
                        <Th>Region</Th>
                        <Th>Status</Th>
                        <Th>Team</Th>
                        <Th>Changed</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.campaigns.map((c) => (
                        <tr key={c.id}>
                          <Td>
                            <Link
                              href={`/field-ops/campaigns/${c.id}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {c.name}
                            </Link>
                          </Td>
                          <Td>{c.regionName}</Td>
                          <Td>
                            <Badge tone={campaignStatusTone(c.status)}>
                              {CAMPAIGN_STATUS_LABEL[c.status]}
                            </Badge>
                          </Td>
                          <Td className="text-muted-foreground">
                            {c.activeMemberCount} active ·{" "}
                            {c.memberCounts.team_lead} lead
                          </Td>
                          <Td className="text-muted-foreground">
                            {timeAgo(c.statusChangedAt)}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  Open a campaign for its territories, team, daily figures and
                  the money it has generated. Onboardings, the review queue,
                  commissions and payouts have their own tabs above.
                </p>
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}
