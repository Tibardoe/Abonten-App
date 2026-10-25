import { EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadTicketPlanSettings } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import { TicketPlanTabs } from "../planStatus";
import { TicketPlanSettingsForm } from "./TicketPlanSettingsForm";

export default async function TicketPlanSettingsPage() {
  await requirePermissionPage("plans.view");
  const { ctx, settings } = await loadTicketPlanSettings();
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;

  return (
    <div>
      <PageHeader
        title="Pay small small settings"
        description={
          settings.data
            ? `Last changed ${timeAgo(settings.data.settings.updatedAt)}. Every change is audited.`
            : undefined
        }
      />
      <TicketPlanTabs active="/ticket-plans/settings" />
      {settings.status !== 200 || !settings.data ? (
        <EmptyState>
          {settings.message ?? "Couldn't load the settings."}
        </EmptyState>
      ) : (
        <TicketPlanSettingsForm
          settings={settings.data.settings}
          killSwitch={settings.data.killSwitch}
          canConfigure={ctx.permissions.includes("plans.configure")}
          stepUpFresh={stepUpFresh}
        />
      )}
    </div>
  );
}
