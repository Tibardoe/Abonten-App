import { EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadDiscoveryOverview } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import { DiscoveryTabs } from "../DiscoveryTabs";
import { SettingsForm } from "./SettingsForm";

export default async function DiscoverySettingsPage() {
  await requirePermissionPage("discovery.view");
  const { ctx, overview } = await loadDiscoveryOverview(1);
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;

  return (
    <div>
      <PageHeader
        title="Discovery settings"
        description={
          overview.data
            ? `Last changed ${timeAgo(overview.data.settings.updatedAt)}. Every change is audited.`
            : undefined
        }
      />
      <DiscoveryTabs active="/discovery/settings" />
      {overview.status !== 200 || !overview.data ? (
        <EmptyState>
          {overview.message ?? "Couldn't load the settings."}
        </EmptyState>
      ) : (
        <SettingsForm
          settings={overview.data.settings}
          killSwitches={overview.data.killSwitches}
          canConfigure={ctx.permissions.includes("discovery.configure")}
          stepUpFresh={stepUpFresh}
        />
      )}
    </div>
  );
}
