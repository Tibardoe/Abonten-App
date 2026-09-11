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
import { loadFieldOpsRegion } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FieldOpsTabs } from "../../FieldOpsTabs";
import { RegionForm } from "../RegionForm";
import { TerritoryForm, TerritoryRowEdit } from "./TerritoryForm";

export default async function FieldOpsRegionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx, detail } = await loadFieldOpsRegion(id);
  if (detail.status === 404) notFound();
  const canManage = ctx.permissions.includes("fieldops.manage");
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;
  const editable = canManage && stepUpFresh;

  if (detail.status !== 200 || !detail.data) {
    return (
      <div>
        <FieldOpsTabs active="/field-ops/regions" />
        <EmptyState>{detail.message ?? "Couldn't load the region."}</EmptyState>
      </div>
    );
  }
  const { region, territories } = detail.data;
  const parents = territories.filter((t) => t.kind === "town");

  return (
    <div>
      <PageHeader
        title={region.name}
        description={
          <>
            {region.countryCode}
            {region.adminCode ? ` · ${region.adminCode}` : ""} ·{" "}
            {territories.length} territories
            {region.liveCampaignId ? (
              <>
                {" "}
                ·{" "}
                <Link
                  href={`/field-ops/campaigns/${region.liveCampaignId}`}
                  className="text-primary hover:underline"
                >
                  live campaign
                </Link>
              </>
            ) : null}
          </>
        }
        actions={
          <Badge tone={region.status === "active" ? "success" : "neutral"}>
            {region.status}
          </Badge>
        }
      />
      <FieldOpsTabs active="/field-ops/regions" />

      {canManage && !stepUpFresh ? (
        <Card className="mb-4 flex items-center gap-2 p-3 text-sm">
          Editing territories needs a fresh identity check.
          <StepUpButton next={`/field-ops/regions/${region.id}`} />
        </Card>
      ) : null}

      <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
        Territories
      </h3>
      {territories.length === 0 ? (
        <EmptyState>
          No territories yet. Add the towns the team will cover; areas can be
          nested under a town later.
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Territory</Th>
              <Th>Kind</Th>
              <Th>Centre</Th>
              <Th>Shape</Th>
              <Th>Status</Th>
              <Th>Updated</Th>
              {editable ? <Th /> : null}
            </tr>
          </thead>
          <tbody>
            {territories.map((t) => (
              <tr key={t.id}>
                <Td>
                  <span className="font-medium">{t.name}</span>
                  {t.parentTerritoryId ? (
                    <div className="text-xs text-muted-foreground">
                      in{" "}
                      {territories.find((p) => p.id === t.parentTerritoryId)
                        ?.name ?? "…"}
                    </div>
                  ) : null}
                  {t.notes ? (
                    <div className="text-xs text-muted-foreground">
                      {t.notes}
                    </div>
                  ) : null}
                </Td>
                <Td>{t.kind}</Td>
                <Td className="font-mono text-xs">
                  {t.centre.lat.toFixed(4)}, {t.centre.lng.toFixed(4)}
                </Td>
                <Td className="text-muted-foreground">
                  {t.boundary
                    ? `polygon (${t.boundary.coordinates[0]?.length ?? 0} points)`
                    : `${(t.radiusM / 1000).toFixed(1)} km radius`}
                </Td>
                <Td>
                  <Badge
                    tone={
                      t.status === "active"
                        ? "success"
                        : t.status === "completed"
                          ? "info"
                          : "neutral"
                    }
                  >
                    {t.status}
                  </Badge>
                </Td>
                <Td className="text-muted-foreground">
                  {timeAgo(t.updatedAt)}
                </Td>
                {editable ? (
                  <Td className="w-96">
                    <TerritoryRowEdit territory={t} parents={parents} />
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {editable ? (
        <>
          <h3 className="mb-2 mt-5 text-sm font-semibold text-muted-foreground">
            Add a territory
          </h3>
          <TerritoryForm
            regionId={region.id}
            countryCode={region.countryCode}
            regionName={region.name}
            parents={parents}
          />
          <h3 className="mb-2 mt-5 text-sm font-semibold text-muted-foreground">
            Region details
          </h3>
          <RegionForm region={region} />
        </>
      ) : null}
    </div>
  );
}
