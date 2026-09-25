import { StepUpButton } from "@/components/StepUpButton";
import { Badge, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadWeeklyScopes } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import { WeeklyTabs } from "../WeeklyTabs";
import { AreaForm } from "./AreaForm";

// Admin › Abonten Weekly › Areas. An edition belongs to one area: the whole
// country, or a centre point and radius (for example Accra, 35 km). Visitors
// are matched to the smallest active area containing their location and see
// their country's picks, labelled as such, when their area has no edition.
// An area belongs to the market its centre is in.

export default async function WeeklyAreasPage() {
  await requirePermissionPage("weekly.view");
  const { ctx, scopes } = await loadWeeklyScopes();
  const canConfigure = ctx.permissions.includes("weekly.configure");
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;
  const editable = canConfigure && stepUpFresh;

  return (
    <div>
      <PageHeader
        title="Areas"
        description="Where each edition applies. Add a regional area only when there is enough to feature there."
      />
      <WeeklyTabs active="/weekly/areas" />

      {canConfigure && !stepUpFresh ? (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-border p-3 text-sm">
          Changing areas needs a fresh identity check.
          <StepUpButton next="/weekly/areas" />
        </div>
      ) : null}

      {scopes.status !== 200 ? (
        <EmptyState>{scopes.message ?? "Couldn't load areas."}</EmptyState>
      ) : (
        <div className="space-y-4">
          <Table>
            <thead>
              <tr>
                <Th>Area</Th>
                <Th>Address</Th>
                <Th>Centre</Th>
                <Th className="text-right">Radius</Th>
                <Th className="text-right">Editions</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {(scopes.data ?? []).map((s) => (
                <tr key={s.id}>
                  <Td className="font-medium">{s.name}</Td>
                  <Td className="font-mono text-xs">/weekly/{s.slug}</Td>
                  <Td className="text-xs text-muted-foreground">
                    {s.isNational
                      ? "Whole country"
                      : `${s.centreLat?.toFixed(4)}, ${s.centreLng?.toFixed(4)}`}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {s.radiusKm ? `${s.radiusKm} km` : "—"}
                  </Td>
                  <Td className="text-right tabular-nums">{s.editionCount}</Td>
                  <Td>
                    <Badge tone={s.status === "active" ? "success" : "neutral"}>
                      {s.status === "active" ? "Active" : "Retired"}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>

          {editable ? (
            <>
              <AreaForm />
              {(scopes.data ?? [])
                .filter((s) => !s.isNational)
                .map((s) => (
                  <AreaForm key={s.id} scope={s} />
                ))}
            </>
          ) : !canConfigure ? (
            <p className="text-sm text-muted-foreground">
              Changing areas needs the “Configure Abonten Weekly” permission.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
