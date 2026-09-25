// Feature flags: read once per process (a minute's cache — the table is a
// handful of rows), evaluated with @abonten/core/flags. Administrators edit
// them in Admin › Markets › Feature flags (featureFlagAdminCore).

import type {
  FeatureFlagDefinition,
  FlagContext,
  FlagRules,
} from "@abonten/core/flags/evaluateFlag";
import { evaluateFlag } from "@abonten/core/flags/evaluateFlag";
import { logger } from "@abonten/core/logger";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

const CACHE_TTL_MS = 60_000;
let cache: { at: number; flags: FeatureFlagDefinition[] } | null = null;

export function invalidateFeatureFlagCache(): void {
  cache = null;
}

export async function listFeatureFlags(): Promise<FeatureFlagDefinition[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.flags;
  const { data, error } = await getSupabaseServiceClient()
    .from("feature_flag")
    .select("key, enabled, rules");
  if (error) {
    logger.error(`featureFlags: load failed (${error.message})`);
    // Fail safe: no flags means every flag reads as off.
    return cache?.flags ?? [];
  }
  const flags = (data ?? []).map((row) => ({
    key: row.key,
    enabled: row.enabled,
    rules: (row.rules as FlagRules | null) ?? null,
  }));
  cache = { at: Date.now(), flags };
  return flags;
}

/** One flag for one request; unknown flags are off. */
export async function isFeatureEnabled(
  key: string,
  ctx: FlagContext,
): Promise<boolean> {
  const flags = await listFeatureFlags();
  return evaluateFlag(flags.find((f) => f.key === key) ?? null, ctx);
}
