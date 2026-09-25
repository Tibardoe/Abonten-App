import { Badge, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireAdmin } from "@/lib/adminGuard";
import { getServiceClient } from "@/lib/serviceClient";
import type { MarketStatus } from "@abonten/core/market/types";
import { listMarketsAdminCore } from "@abonten/services/admin/markets/marketsAdminCore";
import Link from "next/link";
import { CreateMarketForm } from "./CreateMarketForm";
import { MarketsTabs } from "./MarketsTabs";

const TONE: Record<
  MarketStatus,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  draft: "neutral",
  preparing: "info",
  ready: "info",
  live: "success",
  paused: "warning",
  maintenance: "warning",
};

export default async function MarketsPage() {
  const ctx = await requireAdmin();
  const markets = await listMarketsAdminCore(getServiceClient(), ctx);
  const canManage = ctx.permissions.includes("markets.manage");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Markets"
        description="One row per country. Configure a market, run its readiness checks, then activate it — no code change needed."
      />
      <MarketsTabs active="/markets" />

      {markets.status !== 200 || !markets.data ? (
        <EmptyState>{markets.message ?? "Couldn't load markets."}</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Country</Th>
              <Th>Status</Th>
              <Th>Currency</Th>
              <Th>Time zone</Th>
              <Th>Providers</Th>
              <Th>Methods</Th>
              <Th>Payouts</Th>
              <Th>Regions</Th>
            </tr>
          </thead>
          <tbody>
            {markets.data.map((m) => (
              <tr key={m.countryCode} className="hover:bg-muted/40">
                <Td>
                  <Link
                    href={`/markets/${m.countryCode}`}
                    className="font-medium hover:underline"
                  >
                    {m.name}
                  </Link>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {m.countryCode}
                  </span>
                </Td>
                <Td>
                  <Badge tone={TONE[m.status]}>{m.status}</Badge>
                </Td>
                <Td>
                  {m.defaultCurrency}
                  {m.supportedCurrencies.length > 1 ? (
                    <span className="ml-1 text-xs text-muted-foreground">
                      +{m.supportedCurrencies.length - 1}
                    </span>
                  ) : null}
                </Td>
                <Td>{m.defaultTimeZone}</Td>
                <Td>
                  {m.paymentProviders
                    .filter((p) => p.enabled)
                    .map((p) => p.provider)
                    .join(", ") || (
                    <span className="text-muted-foreground">none enabled</span>
                  )}
                </Td>
                <Td>{m.paymentMethods.filter((p) => p.enabled).length}</Td>
                <Td>{m.payoutMethods.filter((p) => p.enabled).length}</Td>
                <Td>{m.regions.filter((r) => r.status === "active").length}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {canManage ? <CreateMarketForm /> : null}
    </div>
  );
}
