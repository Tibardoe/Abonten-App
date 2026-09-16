import { EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadContentSettings } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import { SpotlightTabs } from "../SpotlightTabs";
import { ContentSettingsForm } from "./ContentSettingsForm";

export default async function SpotlightSettingsPage() {
  await requirePermissionPage("spotlight.view");
  const { ctx, settings } = await loadContentSettings();
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;

  return (
    <div>
      <PageHeader
        title="Spotlight & Stories settings"
        description={
          settings.data
            ? `Last changed ${timeAgo(settings.data.settings.updatedAt)}. Every change is audited.`
            : undefined
        }
      />
      <SpotlightTabs active="/spotlight/settings" />
      {settings.status !== 200 || !settings.data ? (
        <EmptyState>
          {settings.message ?? "Couldn't load the settings."}
        </EmptyState>
      ) : (
        <ContentSettingsForm
          settings={settings.data.settings}
          killSwitches={settings.data.killSwitches}
          canConfigure={ctx.permissions.includes("spotlight.configure")}
          stepUpFresh={stepUpFresh}
        />
      )}
    </div>
  );
}
