import { StepUpButton } from "@/components/StepUpButton";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  cn,
  timeAgo,
} from "@/components/ui";
import { loadFieldOpsCampaigns } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import { CAMPAIGN_STATUS_LABEL } from "@abonten/core/fieldOps/campaignLifecycle";
import Link from "next/link";
import { FieldOpsTabs } from "../FieldOpsTabs";
import { campaignStatusTone } from "../page";
import { CampaignForm } from "./CampaignForm";

const FILTERS = [
  { key: "live", label: "Live" },
  { key: "draft", label: "Drafts" },
  { key: "completed", label: "Completed" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" },
] as const;

export default async function FieldOpsCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const status =
    (FILTERS.find((f) => f.key === sp.status)?.key as
      | (typeof FILTERS)[number]["key"]
      | undefined) ?? "all";
  const { ctx, campaigns, regions } = await loadFieldOpsCampaigns({ status });
  const canManage = ctx.permissions.includes("fieldops.manage");
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="One campaign per region run. A campaign is a draft until it has territories and a team lead."
        actions={
          <div className="flex gap-1">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={`/field-ops/campaigns?status=${f.key}`}
                className={cn(
                  "rounded px-2 py-1 text-xs",
                  status === f.key
                    ? "bg-primary text-primary-foreground"
                    : "border border-border hover:bg-muted",
                )}
              >
                {f.label}
              </Link>
            ))}
          </div>
        }
      />
      <FieldOpsTabs active="/field-ops/campaigns" />

      {canManage && !stepUpFresh ? (
        <Card className="mb-4 flex items-center gap-2 p-3 text-sm">
          Creating or changing a campaign needs a fresh identity check.
          <StepUpButton next="/field-ops/campaigns" />
        </Card>
      ) : null}

      {campaigns.status !== 200 || !campaigns.data ? (
        <EmptyState>
          {campaigns.message ?? "Couldn't load campaigns."}
        </EmptyState>
      ) : campaigns.data.length === 0 ? (
        <EmptyState>No campaigns match this filter.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Campaign</Th>
              <Th>Region</Th>
              <Th>Status</Th>
              <Th>Dates</Th>
              <Th>Team</Th>
              <Th>Changed</Th>
            </tr>
          </thead>
          <tbody>
            {campaigns.data.map((c) => (
              <tr key={c.id}>
                <Td>
                  <Link
                    href={`/field-ops/campaigns/${c.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {c.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {c.currency}
                  </div>
                </Td>
                <Td>{c.regionName}</Td>
                <Td>
                  <Badge tone={campaignStatusTone(c.status)}>
                    {CAMPAIGN_STATUS_LABEL[c.status]}
                  </Badge>
                </Td>
                <Td className="text-muted-foreground">
                  {c.startsOn ?? "—"} → {c.endsOn ?? "open"}
                </Td>
                <Td className="text-muted-foreground">
                  {c.activeMemberCount} active
                </Td>
                <Td className="text-muted-foreground">
                  {timeAgo(c.statusChangedAt)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {canManage && stepUpFresh ? (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
            New campaign
          </h3>
          {regions.status === 200 && regions.data && regions.data.length > 0 ? (
            <CampaignForm regions={regions.data} />
          ) : (
            <EmptyState>
              Create a region (and its territories) first under{" "}
              <Link
                href="/field-ops/regions"
                className="text-primary hover:underline"
              >
                Regions &amp; territories
              </Link>
              .
            </EmptyState>
          )}
        </div>
      ) : null}
    </div>
  );
}
