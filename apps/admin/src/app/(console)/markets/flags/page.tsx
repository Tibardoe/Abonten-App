import { EmptyState, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/adminGuard";
import { getServiceClient } from "@/lib/serviceClient";
import { listFeatureFlagsAdminCore } from "@abonten/services/admin/markets/marketsAdminCore";
import { MarketsTabs } from "../MarketsTabs";
import { FlagsEditor } from "./FlagsEditor";

export default async function FeatureFlagsPage() {
  const ctx = await requireAdmin();
  const flags = await listFeatureFlagsAdminCore(getServiceClient(), ctx);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Feature flags"
        description="Targeted switches: by country, platform, cohort, app version and a stable percentage rollout (10% → 25% → 100% without a deploy). An unknown flag is always off."
      />
      <MarketsTabs active="/markets/flags" />
      {flags.status !== 200 || !flags.data ? (
        <EmptyState>{flags.message ?? "Couldn't load flags."}</EmptyState>
      ) : (
        <FlagsEditor
          flags={flags.data}
          canManage={ctx.permissions.includes("markets.manage")}
        />
      )}
    </div>
  );
}
