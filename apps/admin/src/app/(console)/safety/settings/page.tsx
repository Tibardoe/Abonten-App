import { EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadSafetySettings } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import { SafetyTabs } from "../SafetyTabs";
import { SafetySettingsForm } from "./SafetySettingsForm";

export default async function SafetySettingsPage() {
  await requirePermissionPage("safety.view");
  const { ctx, settings } = await loadSafetySettings();
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;

  return (
    <div>
      <PageHeader
        title="Safety settings"
        description={
          settings.data
            ? `Last changed ${timeAgo(settings.data.settings.updatedAt)}. Every change is audited.`
            : undefined
        }
      />
      <SafetyTabs active="/safety/settings" />
      {settings.status !== 200 || !settings.data ? (
        <EmptyState>
          {settings.message ?? "Couldn't load the settings."}
        </EmptyState>
      ) : (
        <SafetySettingsForm
          settings={settings.data.settings}
          killSwitch={settings.data.killSwitch}
          canConfigure={ctx.permissions.includes("safety.configure")}
          stepUpFresh={stepUpFresh}
        />
      )}
    </div>
  );
}
