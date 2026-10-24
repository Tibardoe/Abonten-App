import { EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadIdentitySettings } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import { IdentityTabs } from "../IdentityTabs";
import { IdentitySettingsForm } from "./IdentitySettingsForm";

export default async function IdentitySettingsPage() {
  await requirePermissionPage("identity.view");
  const { ctx, settings } = await loadIdentitySettings();
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;

  return (
    <div>
      <PageHeader
        title="Identity settings"
        description={
          settings.data
            ? `Last changed ${timeAgo(settings.data.settings.updatedAt)}. Every change is audited.`
            : undefined
        }
      />
      <IdentityTabs active="/identity/settings" />
      {settings.status !== 200 || !settings.data ? (
        <EmptyState>
          {settings.message ?? "Couldn't load the settings."}
        </EmptyState>
      ) : (
        <IdentitySettingsForm
          settings={settings.data.settings}
          killSwitch={settings.data.killSwitch}
          canConfigure={ctx.permissions.includes("identity.configure")}
          stepUpFresh={stepUpFresh}
        />
      )}
    </div>
  );
}
