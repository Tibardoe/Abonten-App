import { logger } from "@abonten/core/logger";
import type { AdminContext } from "@abonten/types/adminTypes";
import type {
  AdminRebateRun,
  AdminRebateSummary,
  MonthlyRewardRuleKey,
} from "@abonten/types/rewards";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  type AdminEnvelope,
  adminError,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";
import { dbError, displayName, namesFor } from "./rewardsAdminCore";

// Admin side of the monthly rebates (Abonten Rewards Phase 6, + place visits
// in Phase 8): the run log,
// what the rebates cost, who earned most, and running a month by hand. Same
// contract as the other Rewards admin cores: service-role client + a
// resolved AdminContext, permission re-checked here, changes audited.

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const denied = (e: unknown): AdminEnvelope<never> =>
  adminError(e) as AdminEnvelope<never>;

type RequestMeta = Record<string, unknown> | undefined;

type RuleKey = MonthlyRewardRuleKey;
const RULE_KEYS: RuleKey[] = [
  "organizer_rebate",
  "venue_rebate",
  "organizer_milestone",
  "place_visits",
];

const TOP_KIND: Partial<Record<RuleKey, "organizer" | "venue" | "visits">> = {
  organizer_rebate: "organizer",
  venue_rebate: "venue",
  place_visits: "visits",
};

type RunRow = {
  id: string;
  period_start: string;
  triggered_by: string | null;
  shadow_mode: boolean;
  started_at: string;
  finished_at: string | null;
  stats: {
    events?: number;
    places?: number;
    errors?: number;
    skipped?: string;
    last_error?: string;
    rewards?: Record<string, Record<string, number>>;
  } | null;
};

function mapRun(
  row: RunRow,
  names: Map<string, { username: string | null; fullName: string | null }>,
): AdminRebateRun {
  const stats = row.stats ?? {};
  const byRule: AdminRebateRun["byRule"] = {};
  for (const key of RULE_KEYS) {
    const r = stats.rewards?.[key];
    if (!r) continue;
    byRule[key] = {
      decided: num(r.decided),
      released: num(r.released),
      held: num(r.held),
      rejected: num(r.rejected),
      shadow: num(r.shadow),
      amountMinor: num(r.amount_minor),
    };
  }
  return {
    id: row.id,
    periodStart: row.period_start,
    triggeredBy: row.triggered_by
      ? (displayName(names.get(row.triggered_by)) ?? "an admin")
      : null,
    shadowMode: row.shadow_mode,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    events: num(stats.events),
    places: num(stats.places),
    errors: num(stats.errors),
    skipped: stats.skipped ?? null,
    lastError: stats.last_error ?? null,
    byRule,
  };
}

export async function getRebateSummaryCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  sinceDays = 90,
): Promise<AdminEnvelope<AdminRebateSummary>> {
  try {
    assertPermission(ctx, "rewards.view");
  } catch (e) {
    return denied(e);
  }

  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const [runs, events, settings, live] = await Promise.all([
    supabase
      .from("reward_rebate_run")
      .select(
        "id, period_start, triggered_by, shadow_mode, started_at, finished_at, stats",
      )
      .order("started_at", { ascending: false })
      .limit(12),
    supabase
      .from("reward_event")
      .select(
        "rule_key, status, status_reason, is_shadow, amount_minor, released_minor, basis, beneficiary_user_id",
      )
      .in("rule_key", RULE_KEYS)
      .gte("created_at", since)
      .limit(10_000),
    supabase
      .from("reward_program_setting")
      .select("shadow_mode")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("reward_rule")
      .select("rule_key")
      .eq("is_active", true)
      .in("rule_key", RULE_KEYS),
  ]);
  if (runs.error || events.error) {
    logger.error(
      `getRebateSummaryCore failed: ${runs.error?.message ?? events.error?.message}`,
    );
    return { status: 500, message: "Something went wrong" };
  }

  const byRule: AdminRebateSummary["byRule"] = {};
  const reasons = new Map<string, number>();
  const top = new Map<
    string,
    {
      kind: "organizer" | "venue" | "visits";
      amountMinor: number;
      events: number;
    }
  >();
  let net = 0;

  for (const row of events.data ?? []) {
    const key = row.rule_key as RuleKey;
    const bucket = byRule[key] ?? {
      count: 0,
      amountMinor: 0,
      shadowAmountMinor: 0,
      rejected: 0,
    };
    const amount =
      row.status === "released"
        ? num(row.released_minor)
        : num(row.amount_minor);
    if (row.status === "rejected") {
      bucket.rejected += 1;
      if (row.status_reason) {
        reasons.set(
          row.status_reason,
          (reasons.get(row.status_reason) ?? 0) + 1,
        );
      }
    } else if (row.status !== "voided") {
      bucket.count += 1;
      if (row.is_shadow) bucket.shadowAmountMinor += amount;
      else bucket.amountMinor += amount;
      const kind = TOP_KIND[key];
      if (kind) {
        const t = top.get(`${row.beneficiary_user_id}:${key}`) ?? {
          kind,
          amountMinor: 0,
          events: 0,
        };
        t.amountMinor += amount;
        t.events += 1;
        top.set(`${row.beneficiary_user_id}:${key}`, t);
      }
    }
    if (key === "organizer_rebate") {
      net += num((row.basis as Record<string, unknown> | null)?.net_cash_minor);
    }
    byRule[key] = bucket;
  }

  const topRows = [...top.entries()]
    .sort(([, a], [, b]) => b.amountMinor - a.amountMinor)
    .slice(0, 10);
  const names = await namesFor(supabase, [
    ...topRows.map(([k]) => k.split(":")[0]),
    ...(runs.data ?? []).map((r) => r.triggered_by),
  ]);

  return {
    status: 200,
    data: {
      sinceDays,
      shadowMode: settings.data?.shadow_mode !== false,
      liveRules: (live.data ?? []).map((r) => r.rule_key as RuleKey),
      runs: ((runs.data ?? []) as unknown as RunRow[]).map((r) =>
        mapRun(r, names),
      ),
      byRule,
      netRevenueMinor: net,
      rejectReasons: [...reasons.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
      top: topRows.map(([k, t]) => {
        const userId = k.split(":")[0];
        return {
          userId,
          name: displayName(names.get(userId)),
          kind: t.kind,
          amountMinor: t.amountMinor,
          events: t.events,
        };
      }),
    },
  };
}

/**
 * Runs the monthly rebates for one month now (the cron does last month on
 * the 3rd). Safe to repeat: events already decided live are skipped, and in
 * shadow mode nothing is posted.
 */
export async function runMonthlyRebatesCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { periodStart: string; reason: string },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<AdminRebateRun>> {
  try {
    assertPermission(ctx, "rewards.configure");
  } catch (e) {
    return denied(e);
  }

  const { data, error } = await supabase.rpc("rewards_run_monthly_rebates", {
    p_period_start: input.periodStart,
    p_triggered_by: ctx.userId,
  });
  if (error) return dbError(error, "Could not run the rebates");

  const result = (data ?? {}) as { run_id?: string };
  const { data: row } = await supabase
    .from("reward_rebate_run")
    .select(
      "id, period_start, triggered_by, shadow_mode, started_at, finished_at, stats",
    )
    .eq("id", result.run_id as string)
    .maybeSingle();
  const run = row
    ? mapRun(row as unknown as RunRow, await namesFor(supabase, [ctx.userId]))
    : null;

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "rewards.rebates.run",
    targetType: "reward_rebate_run",
    targetId: result.run_id ?? input.periodStart,
    summary: `Ran monthly rebates for ${input.periodStart.slice(0, 7)}${
      run?.shadowMode ? " (shadow)" : ""
    }`,
    reason: input.reason,
    after: data as Record<string, unknown>,
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  if (!run)
    return {
      status: 500,
      message: "The run finished but its record is missing.",
    };
  const decided = Object.values(run.byRule).reduce(
    (sum, r) => sum + (r?.decided ?? 0),
    0,
  );
  return {
    status: 200,
    message: run.skipped
      ? "No rebate rule is live, so nothing was decided."
      : `Checked ${run.events} event${run.events === 1 ? "" : "s"}${
          run.places > 0
            ? ` and ${run.places} place${run.places === 1 ? "" : "s"} with visits`
            : ""
        }; ${decided} new decision${decided === 1 ? "" : "s"}${
          run.errors > 0 ? `, ${run.errors} failed (see Monitoring)` : ""
        }.`,
    data: run,
  };
}
