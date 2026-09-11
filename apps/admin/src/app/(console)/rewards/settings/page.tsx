import { EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { loadNotificationDelivery, loadRewardsOverview } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import { RewardsTabs } from "../RewardsTabs";
import { SettingsForm } from "./SettingsForm";

export default async function RewardsSettingsPage() {
  const now = new Date().toISOString();
  const [{ ctx, overview }, delivery] = await Promise.all([
    loadRewardsOverview({ from: now, to: now }),
    loadNotificationDelivery(),
  ]);
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;

  return (
    <div>
      <PageHeader
        title="Program settings"
        description={
          overview.data
            ? `Last changed ${timeAgo(overview.data.settings.updatedAt)}. Every change is audited.`
            : undefined
        }
      />
      <RewardsTabs active="/rewards/settings" />
      {overview.status !== 200 || !overview.data ? (
        <EmptyState>
          {overview.message ?? "Couldn't load the settings."}
        </EmptyState>
      ) : (
        <SettingsForm
          settings={overview.data.settings}
          canConfigure={ctx.permissions.includes("rewards.configure")}
          stepUpFresh={stepUpFresh}
          delivery={delivery.status === 200 ? (delivery.data ?? null) : null}
        />
      )}
    </div>
  );
}
