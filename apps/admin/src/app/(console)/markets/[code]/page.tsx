import { StepUpButton } from "@/components/StepUpButton";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/adminGuard";
import { getServiceClient } from "@/lib/serviceClient";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import { getMarketAdminCore } from "@abonten/services/admin/markets/marketsAdminCore";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketEditor } from "./MarketEditor";

export default async function MarketDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const ctx = await requireAdmin();
  const svc = getServiceClient();
  const market = await getMarketAdminCore(svc, ctx, code.toUpperCase());
  if (market.status === 404) notFound();

  const { data: lastRun } = await svc
    .from("market_readiness_run")
    .select("ran_at, can_activate, report")
    .eq("country_code", code.toUpperCase())
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;

  if (market.status !== 200 || !market.data) {
    return (
      <EmptyState>{market.message ?? "Couldn't load this market."}</EmptyState>
    );
  }
  const m = market.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${m.name} (${m.countryCode})`}
        description={
          <span className="flex items-center gap-2">
            <Badge
              tone={
                m.status === "live"
                  ? "success"
                  : m.status === "paused"
                    ? "warning"
                    : "neutral"
              }
            >
              {m.status}
            </Badge>
            <span>
              {m.defaultCurrency} · {m.defaultTimeZone} · version {m.version}
            </span>
            <Link href="/markets" className="text-xs underline">
              All markets
            </Link>
          </span>
        }
        actions={
          ctx.permissions.includes("markets.activate") ? (
            <StepUpButton />
          ) : undefined
        }
      />
      <MarketEditor
        market={m}
        canManage={ctx.permissions.includes("markets.manage")}
        canActivate={ctx.permissions.includes("markets.activate")}
        stepUpFresh={stepUpFresh}
        lastReadiness={
          lastRun
            ? {
                ranAt: lastRun.ran_at,
                canActivate: lastRun.can_activate,
                report: lastRun.report as never,
              }
            : null
        }
      />
    </div>
  );
}
