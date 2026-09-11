import { StepUpButton } from "@/components/StepUpButton";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  timeAgo,
} from "@/components/ui";
import { loadFieldOpsRegions } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import Link from "next/link";
import { FieldOpsTabs } from "../FieldOpsTabs";
import { RegionForm } from "./RegionForm";

export default async function FieldOpsRegionsPage() {
  const { ctx, regions } = await loadFieldOpsRegions();
  const canManage = ctx.permissions.includes("fieldops.manage");
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;

  return (
    <div>
      <PageHeader
        title="Regions & territories"
        description="A region is where a campaign runs (e.g. Ashanti). Its territories are the towns and areas the team is assigned to."
      />
      <FieldOpsTabs active="/field-ops/regions" />

      {canManage && !stepUpFresh ? (
        <Card className="mb-4 flex items-center gap-2 p-3 text-sm">
          Adding or editing regions needs a fresh identity check.
          <StepUpButton next="/field-ops/regions" />
        </Card>
      ) : null}

      {regions.status !== 200 || !regions.data ? (
        <EmptyState>{regions.message ?? "Couldn't load regions."}</EmptyState>
      ) : regions.data.length === 0 ? (
        <EmptyState>No regions yet.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Region</Th>
              <Th>Code</Th>
              <Th>Territories</Th>
              <Th>Live campaign</Th>
              <Th>Status</Th>
              <Th>Updated</Th>
            </tr>
          </thead>
          <tbody>
            {regions.data.map((r) => (
              <tr key={r.id}>
                <Td>
                  <Link
                    href={`/field-ops/regions/${r.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {r.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {r.countryCode}
                  </div>
                </Td>
                <Td className="font-mono text-xs">{r.adminCode ?? "—"}</Td>
                <Td className="tabular-nums">{r.territoryCount}</Td>
                <Td>
                  {r.liveCampaignId ? (
                    <Link
                      href={`/field-ops/campaigns/${r.liveCampaignId}`}
                      className="text-primary hover:underline"
                    >
                      open
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">none</span>
                  )}
                </Td>
                <Td>
                  <Badge tone={r.status === "active" ? "success" : "neutral"}>
                    {r.status}
                  </Badge>
                </Td>
                <Td className="text-muted-foreground">
                  {timeAgo(r.updatedAt)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {canManage && stepUpFresh ? (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
            New region
          </h3>
          <RegionForm />
        </div>
      ) : null}
    </div>
  );
}
