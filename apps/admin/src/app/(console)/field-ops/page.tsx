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
import { loadFieldOpsOverview } from "@/lib/data";
import { CAMPAIGN_STATUS_LABEL } from "@abonten/core/fieldOps/campaignLifecycle";
import type { FieldOpsCampaignStatus } from "@abonten/types/fieldOps";
import Link from "next/link";
import { FieldOpsTabs } from "./FieldOpsTabs";

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
            const s = overview.data.settings;
            const live = overview.data.campaigns.filter((c) =>
              ["active", "paused", "winding_down"].includes(c.status),
            );
            return (
              <>
                <Card className="mb-4 flex flex-wrap items-center gap-2 p-3 text-xs">
                  <span className="font-semibold">Programme</span>
                  <Badge tone={s.programEnabled ? "success" : "neutral"}>
                    {s.programEnabled ? "On" : "Off"}
                  </Badge>
                  {overview.data.killSwitchOn ? (
                    <Badge tone="danger">
                      Kill switch set on this deployment
                    </Badge>
                  ) : null}
                  <Badge tone="neutral">
                    {overview.data.liveRuleCount} live commission{" "}
                    {overview.data.liveRuleCount === 1 ? "rule" : "rules"}
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

                <div className="grid gap-3 sm:grid-cols-4">
                  <Stat
                    label="Live campaigns"
                    value={live.length}
                    href="/field-ops/campaigns?status=live"
                  />
                  <Stat
                    label="Active members"
                    value={live.reduce((n, c) => n + c.activeMemberCount, 0)}
                    hint="across live campaigns"
                  />
                  <Stat
                    label="Regions"
                    value={overview.data.regionCount}
                    href="/field-ops/regions"
                  />
                  <Stat
                    label="Territories"
                    value={overview.data.territoryCount}
                    hint="towns and areas mapped"
                  />
                </div>

                <h3 className="mb-2 mt-5 text-sm font-semibold text-muted-foreground">
                  Campaigns
                </h3>
                {overview.data.campaigns.length === 0 ? (
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
                      {overview.data.campaigns.map((c) => (
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
                  Onboardings, commissions and payouts appear here once those
                  phases ship. Until then this module only holds the set-up:
                  regions, territories, campaigns, teams and rules.
                </p>
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}
