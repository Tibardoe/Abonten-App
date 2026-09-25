import type { FieldOpsCommissionTotals } from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { getDefaultMarket } from "../../markets/marketConfig";
import { num } from "./fieldOpsAdminShared";

// One read for "what does the programme owe": admin_fieldops_commission_totals
// sums every fieldops_commission row per status and currency in SQL. The
// overview and the commissions list used to sum rows in JavaScript under a
// silent row cap and assumed the first row's currency.

const EMPTY = (currency: string): FieldOpsCommissionTotals => ({
  currency,
  rows: 0,
  pendingMinor: 0,
  approvedMinor: 0,
  inPayoutMinor: 0,
  paidMinor: 0,
  rejectedMinor: 0,
  reversedMinor: 0,
});

export function parseCommissionTotals(
  raw: unknown,
): FieldOpsCommissionTotals[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      currency: typeof r.currency === "string" ? r.currency.trim() : "",
      rows: num(r.rows),
      pendingMinor: num(r.pending),
      approvedMinor: num(r.approved),
      inPayoutMinor: num(r.in_payout),
      paidMinor: num(r.paid),
      rejectedMinor: num(r.rejected),
      reversedMinor: num(r.reversed),
    };
  });
}

/**
 * Totals per currency, the busiest first. `fallbackCurrency` names the
 * primary row when there are no commissions yet, so a tile can still say
 * "GH₵0.00" in the right currency.
 */
export async function loadCommissionTotals(
  supabase: ServiceRoleClient,
  opts: { campaignId?: string | null; fallbackCurrency?: string } = {},
): Promise<{
  primary: FieldOpsCommissionTotals;
  others: FieldOpsCommissionTotals[];
  error: string | null;
}> {
  const { data, error } = await supabase.rpc(
    "admin_fieldops_commission_totals",
    { p_campaign_id: opts.campaignId ?? undefined },
  );
  const rows = parseCommissionTotals(data);
  const [
    primary = EMPTY(
      opts.fallbackCurrency ?? (await getDefaultMarket()).defaultCurrency,
    ),
    ...others
  ] = rows;
  return { primary, others, error: error?.message ?? null };
}
