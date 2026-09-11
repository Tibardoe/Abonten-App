import { EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { loadFieldOpsSettings } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import { FieldOpsTabs } from "../FieldOpsTabs";
import { SettingsForm } from "./SettingsForm";

export default async function FieldOpsSettingsPage() {
  const { ctx, settings } = await loadFieldOpsSettings();
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;

  return (
    <div>
      <PageHeader
        title="Field Ops settings"
        description={
          settings.data
            ? `Last changed ${timeAgo(settings.data.updatedAt)}. Every change is audited.`
            : undefined
        }
      />
      <FieldOpsTabs active="/field-ops/settings" />
      {settings.status !== 200 || !settings.data ? (
        <EmptyState>
          {settings.message ?? "Couldn't load the settings."}
        </EmptyState>
      ) : (
        <SettingsForm
          settings={settings.data}
          canManage={ctx.permissions.includes("fieldops.manage")}
          stepUpFresh={stepUpFresh}
        />
      )}
    </div>
  );
}
