import { EmptyState, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/adminGuard";
import { getServiceClient } from "@/lib/serviceClient";
import { getExchangeRatesAdminCore } from "@abonten/services/admin/markets/marketsAdminCore";
import { MarketsTabs } from "../MarketsTabs";
import { RatesPanel } from "./RatesPanel";

export default async function ExchangeRatesPage() {
  const ctx = await requireAdmin();
  const rates = await getExchangeRatesAdminCore(getServiceClient(), ctx);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Exchange rates"
        description="Display estimates only — a visitor browsing another market sees “≈” prices in their own currency. Nothing is ever charged or settled at these rates."
      />
      <MarketsTabs active="/markets/rates" />
      {rates.status !== 200 || !rates.data ? (
        <EmptyState>
          {rates.message ?? "Couldn't load exchange rates."}
        </EmptyState>
      ) : (
        <RatesPanel
          config={rates.data.config}
          table={rates.data.table}
          canManage={ctx.permissions.includes("markets.manage")}
        />
      )}
    </div>
  );
}
