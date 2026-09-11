import type { AdminContext } from "@abonten/types/adminTypes";
import type { FieldOpsAdminOverview } from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { isFieldOpsKillSwitchOn } from "../../fieldOps/shared/killSwitch";
import { type AdminEnvelope, assertPermission } from "../adminContext";
import { listCampaignsCore } from "./campaignsAdminCore";
import { denied, readSettings } from "./fieldOpsAdminShared";

// Admin > Field Ops overview: the programme's switches, live campaigns and
// a few counts. Onboarding / commission KPIs join in Phase 3 and 7.

export async function getFieldOpsOverviewCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
): Promise<AdminEnvelope<FieldOpsAdminOverview>> {
  try {
    assertPermission(ctx, "fieldops.view");
  } catch (e) {
    return denied(e);
  }
  const [settings, campaigns, regions, territories, rules] = await Promise.all([
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
  ]);
  if (!settings) return { status: 500, message: "Something went wrong" };
  if (campaigns.status !== 200 || !campaigns.data) {
    return { status: campaigns.status, message: campaigns.message };
  }
  return {
    status: 200,
    data: {
      settings,
      killSwitchOn: isFieldOpsKillSwitchOn(),
      campaigns: campaigns.data,
      regionCount: regions.count ?? 0,
      territoryCount: territories.count ?? 0,
      liveRuleCount: rules.count ?? 0,
    },
  };
}
