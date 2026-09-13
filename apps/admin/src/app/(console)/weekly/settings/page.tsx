import { EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadWeeklySettings } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import { WeeklyTabs } from "../WeeklyTabs";
import { WeeklySettingsForm } from "./WeeklySettingsForm";

export default async function WeeklySettingsPage() {
  await requirePermissionPage("weekly.view");
  const { ctx, settings } = await loadWeeklySettings();
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;

  return (
    <div>
      <PageHeader
        title="Abonten Weekly settings"
        description={
          settings.data
            ? `Last changed ${timeAgo(settings.data.settings.updatedAt)}. Every change is audited.`
            : undefined
        }
      />
      <WeeklyTabs active="/weekly/settings" />
      {settings.status !== 200 || !settings.data ? (
        <EmptyState>
          {settings.message ?? "Couldn't load the settings."}
        </EmptyState>
      ) : (
        <WeeklySettingsForm
          settings={settings.data.settings}
          killSwitch={settings.data.killSwitch}
          canConfigure={ctx.permissions.includes("weekly.configure")}
          stepUpFresh={stepUpFresh}
        />
      )}
    </div>
  );
}
