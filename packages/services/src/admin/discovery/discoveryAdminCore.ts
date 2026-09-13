import { logger } from "@abonten/core/logger";
import type { AdminContext } from "@abonten/types/adminTypes";
import type {
  DiscoveryAudience,
  DiscoverySettings,
} from "@abonten/types/discoveryType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  type DiscoverySettingRow,
  isRecommendationsKillSwitchOn,
  isSearchKillSwitchOn,
  mapDiscoverySettings,
  readDiscoverySettings,
  resetDiscoverySettingsCache,
} from "../../search/discoveryProgram";
import {
  type AdminEnvelope,
  adminError,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

// Admin › Discovery: search analytics, recommendation metrics (including
// shadow-mode projections), subscription and prompt counts, and the
// programme switches. Reads need discovery.view; changes need
// discovery.configure plus step-up (checked by the admin transport), a
// reason, and the settings row's last updated_at (optimistic concurrency).
// Every change is audited field by field.

type RequestMeta = Record<string, unknown> | undefined;

const denied = (e: unknown): AdminEnvelope<never> =>
  adminError(e) as AdminEnvelope<never>;

export type SearchInsights = {
  days: number;
  totals: {
    searches: number;
    zero_results: number;
    clicks: number;
    p50_ms: number | null;
    p95_ms: number | null;
  } | null;
  daily: {
    day: string;
    searches: number;
    zero_results: number;
    clicks: number;
  }[];
  topQueries: {
    query_norm: string;
    searches: number;
    clicks: number;
    zero_results: number;
  }[];
  zeroResultQueries: { query_norm: string; searches: number }[];
  byMode: { mode: string; searches: number; clicks: number }[];
  clicksByType: { clicked_type: string; clicks: number }[];
  byPlatform: { platform: string; searches: number }[];
};

export type RecommendationMetrics = {
  days: number;
  settings: Record<string, unknown> | null;
  subscriptions: Record<
    string,
    { active: number; paused: number; unsubscribed: number }
  >;
  subscriptionsBySource: Record<string, number>;
  prompts: { shown: number; accepted: number; dismissed: number } | null;
  candidatesByReason: Record<string, { live: number; shadow: number }>;
  statusCounts: Record<string, number>;
  suppressedByReason: Record<string, number>;
  digestsDaily: {
    date: string;
    live: number;
    shadow: number;
    items: number;
    opened: number;
  }[];
  deliveryStatus: Record<string, number>;
  perUserDigests: {
    live: {
      users: number;
      p50: number | null;
      p95: number | null;
      max: number | null;
    };
    shadow: {
      users: number;
      p50: number | null;
      p95: number | null;
      max: number | null;
    };
  } | null;
  openRate: number | null;
  clickRate: number | null;
  dismissRate: number | null;
  skipsByReason: Record<string, number>;
};

export type DiscoveryOverview = {
  settings: DiscoverySettings;
  killSwitches: { search: boolean; recommendations: boolean };
  search: SearchInsights;
  recommendations: RecommendationMetrics;
  deliveryBySource: Record<string, Record<string, number>>;
};

export async function getDiscoveryOverviewCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { days?: number } = {},
): Promise<AdminEnvelope<DiscoveryOverview>> {
  try {
    assertPermission(ctx, "discovery.view");
  } catch (e) {
    return denied(e);
  }
  const days = Math.min(Math.max(Math.trunc(input.days ?? 14), 1), 180);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const [row, search, recs, delivery] = await Promise.all([
    readDiscoverySettings(supabase, { fresh: true }),
    supabase.rpc("admin_search_insights", { p_days: days }),
    supabase.rpc("admin_recommendation_metrics", { p_days: days }),
    supabase
      .from("notification_delivery")
      .select("source, status")
      .gte("created_at", since)
      .limit(50_000),
  ]);

  if (!row || search.error || recs.error) {
    logger.error(
      `getDiscoveryOverviewCore failed: ${search.error?.message ?? recs.error?.message ?? "settings row missing"}`,
    );
    return { status: 500, message: "Couldn't load discovery data." };
  }

  const deliveryBySource: Record<string, Record<string, number>> = {};
  for (const d of delivery.data ?? []) {
    const bucket = deliveryBySource[d.source] ?? {};
    bucket[d.status] = (bucket[d.status] ?? 0) + 1;
    deliveryBySource[d.source] = bucket;
  }

  return {
    status: 200,
    data: {
      settings: mapDiscoverySettings(row),
      killSwitches: {
        search: isSearchKillSwitchOn(),
        recommendations: isRecommendationsKillSwitchOn(),
      },
      search: search.data as unknown as SearchInsights,
      recommendations: recs.data as unknown as RecommendationMetrics,
      deliveryBySource,
    },
  };
}

export type DiscoverySettingsPatch = Partial<
  Omit<DiscoverySettings, "updatedAt" | "updatedBy" | "generateWatermark">
>;

const COLUMN: Record<keyof DiscoverySettingsPatch, keyof DiscoverySettingRow> =
  {
    searchV2Enabled: "search_v2_enabled",
    searchAudience: "search_audience",
    organizerSearchEnabled: "organizer_search_enabled",
    placeSearchEnabled: "place_search_enabled",
    searchLoggingEnabled: "search_logging_enabled",
    searchLogRetentionDays: "search_log_retention_days",
    recommendationsEnabled: "recommendations_enabled",
    recommendationsShadowMode: "recommendations_shadow_mode",
    recommendationsAudience: "recommendations_audience",
    promptsEnabled: "prompts_enabled",
    betaUserIds: "beta_user_ids",
    dailyPushCap: "daily_push_cap",
    weeklyPushCap: "weekly_push_cap",
    organizerCooldownHours: "organizer_cooldown_hours",
    similarDefaultRadiusKm: "similar_default_radius_km",
    candidateTtlDays: "candidate_ttl_days",
    ignorePauseAfter: "ignore_pause_after",
    ignorePauseDays: "ignore_pause_days",
    digestHourLocal: "digest_hour_local",
    promptCooldownDays: "prompt_cooldown_days",
    promptDismissDays: "prompt_dismiss_days",
    promptMaxShows: "prompt_max_shows",
    recommendationRetentionDays: "recommendation_retention_days",
  };

const AUDIENCES: DiscoveryAudience[] = ["staff", "beta", "all"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validate(patch: DiscoverySettingsPatch): string | null {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (!(key in COLUMN)) return `Unknown setting: ${key}`;
    if (key === "searchAudience" || key === "recommendationsAudience") {
      if (!AUDIENCES.includes(value as DiscoveryAudience))
        return "Audience must be staff, beta or all.";
    } else if (key === "betaUserIds") {
      if (
        !Array.isArray(value) ||
        value.some((v) => typeof v !== "string" || !UUID.test(v))
      ) {
        return "Beta users must be a list of user ids.";
      }
      if (value.length > 500) return "At most 500 beta users.";
    } else if (key.endsWith("Enabled") || key === "recommendationsShadowMode") {
      if (typeof value !== "boolean") return `${key} must be on or off.`;
    } else if (typeof value !== "number" || !Number.isFinite(value)) {
      return `${key} must be a number.`;
    }
  }
  return null;
}

export async function updateDiscoverySettingsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: {
    patch: DiscoverySettingsPatch;
    expectedUpdatedAt: string;
    reason: string;
    /** Start recommending only what is published from now on. */
    resetWatermark?: boolean;
  },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<DiscoverySettings>> {
  try {
    assertPermission(ctx, "discovery.configure");
  } catch (e) {
    return denied(e);
  }
  if (!input.reason || input.reason.trim().length < 5) {
    return { status: 400, message: "Give a short reason for this change." };
  }
  const invalid = validate(input.patch);
  if (invalid) return { status: 400, message: invalid };

  const beforeRow = await readDiscoverySettings(supabase, { fresh: true });
  if (!beforeRow) return { status: 500, message: "Something went wrong" };
  const before = mapDiscoverySettings(beforeRow);

  const update: Record<string, unknown> = {};
  const changed: string[] = [];
  for (const [key, value] of Object.entries(input.patch)) {
    const column = COLUMN[key as keyof DiscoverySettingsPatch];
    if (!column || value === undefined) continue;
    if (
      JSON.stringify(before[key as keyof DiscoverySettings]) ===
      JSON.stringify(value)
    )
      continue;
    update[column] = value;
    changed.push(key);
  }
  if (input.resetWatermark) {
    update.generate_watermark = new Date().toISOString();
    changed.push("generateWatermark");
  }
  if (changed.length === 0) return { status: 400, message: "Nothing changed." };

  // Turning recommendations on for the first time must not replay every
  // event published while they were off.
  if (
    update.recommendations_enabled === true &&
    !before.recommendationsEnabled &&
    !input.resetWatermark
  ) {
    update.generate_watermark = new Date().toISOString();
    changed.push("generateWatermark");
  }

  update.updated_at = new Date().toISOString();
  update.updated_by = ctx.userId;

  const { data, error } = await supabase
    .from("discovery_program_setting")
    .update(update as never)
    .eq("id", 1)
    .eq("updated_at", input.expectedUpdatedAt)
    .select("*")
    .maybeSingle();
  if (error) {
    logger.error(`updateDiscoverySettingsCore failed: ${error.message}`);
    return { status: 400, message: error.message };
  }
  if (!data) {
    return {
      status: 409,
      message: "Someone else changed these settings. Reload and try again.",
    };
  }
  resetDiscoverySettingsCache();

  const after = mapDiscoverySettings(data);
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "discovery.settings.update",
    targetType: "discovery_program_setting",
    targetId: "1",
    summary: `Discovery settings changed: ${changed.join(", ")}`,
    reason: input.reason,
    before: Object.fromEntries(
      changed.map((k) => [k, before[k as keyof DiscoverySettings]]),
    ),
    after: Object.fromEntries(
      changed.map((k) => [k, after[k as keyof DiscoverySettings]]),
    ),
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return { status: 200, message: "Settings saved.", data: after };
}
