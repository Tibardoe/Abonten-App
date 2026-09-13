import type { AdminContext } from "@abonten/types/adminTypes";
import type { FieldOpsAdminOverview } from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { isFieldOpsKillSwitchOn } from "../../fieldOps/shared/killSwitch";
import { type AdminEnvelope, assertPermission } from "../adminContext";
import { listCampaignsCore } from "./campaignsAdminCore";
import { loadCommissionTotals } from "./commissionTotals";
import { denied, readSettings } from "./fieldOpsAdminShared";

// Admin > Field Ops overview: the programme's switches, live campaigns, a
// few counts, and what the commission ledger owes — the money summed in SQL
// per currency (admin_fieldops_commission_totals), never under a row cap.

export async function getFieldOpsOverviewCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
): Promise<AdminEnvelope<FieldOpsAdminOverview>> {
  try {
    assertPermission(ctx, "fieldops.view");
  } catch (e) {
    return denied(e);
  }
  const [
    settings,
    campaigns,
    regions,
    territories,
    rules,
    submitted,
    flagged,
    succeeded,
    health,
  ] = await Promise.all([
    readSettings(supabase),
    listCampaignsCore(supabase, ctx, { status: "all" }),
    supabase
      .from("fieldops_region")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("fieldops_territory")
      .select("id", { count: "exact", head: true })
      .neq("status", "retired"),
    supabase
      .from("fieldops_commission_rule")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("fieldops_onboarding")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted"),
    supabase
      .from("fieldops_onboarding")
      .select("id", { count: "exact", head: true })
      .eq("status", "flagged"),
    supabase
      .from("fieldops_onboarding")
      .select("id", { count: "exact", head: true })
      .eq("status", "succeeded"),
    supabase.rpc("fieldops_health"),
  ]);
  if (!settings) return { status: 500, message: "Something went wrong" };
  if (campaigns.status !== 200 || !campaigns.data) {
    return { status: campaigns.status, message: campaigns.message };
  }

  const totals = await loadCommissionTotals(supabase, {
    fallbackCurrency: campaigns.data[0]?.currency ?? "GHS",
  });
  if (totals.error) {
    return { status: 500, message: "Couldn't total the commissions." };
  }
  const h = (health.data ?? {}) as Record<string, number | boolean>;

  return {
    status: 200,
    data: {
      settings,
      killSwitchOn: isFieldOpsKillSwitchOn(),
      campaigns: campaigns.data,
      regionCount: regions.count ?? 0,
      territoryCount: territories.count ?? 0,
      liveRuleCount: rules.count ?? 0,
      money: { ...totals.primary, otherCurrencies: totals.others },
      awaitingReview: submitted.count ?? 0,
      flagged: flagged.count ?? 0,
      succeeded: succeeded.count ?? 0,
      sweepLagSeconds: Number(h.sweep_lag_seconds ?? 0),
    },
  };
}
