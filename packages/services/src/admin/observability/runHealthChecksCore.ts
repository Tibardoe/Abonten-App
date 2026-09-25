import { logger } from "@abonten/core/logger";
import type { HealthCheckKey } from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { listOpenMarkets } from "../../markets/marketConfig";
import {
  getPaymentProvider,
  resolveMarketAccounts,
} from "../../payments/providers/registry";
import {
  type HealthCheckOutcome,
  recordHealthResultsCore,
} from "./observabilityCore";

// Runs the dependency health checks and persists a row per check. Invoked
// by GET /api/observability/health, which a pg_cron job hits every 1-2 min
// with the shared secret. Real probes — no check reports "ok" without
// actually reaching the dependency (spec §32/§35).
//
// Secrets are injected by the route handler (which reads process.env), so
// this stays env-agnostic.

export type HealthCheckConfig = {
  resendApiKey?: string;
  cloudinaryCloudName?: string;
  cloudinaryApiKey?: string;
  cloudinaryApiSecret?: string;
  hubtelClientId?: string;
  hubtelClientSecret?: string;
  expoAccessToken?: string;
  /** PAYMENTS_MODE and VERCEL_ENV of this deployment, reported as-is. */
  paymentsMode?: string | null;
  deploymentEnv?: string | null;
};

async function timed<T>(
  fn: () => Promise<T>,
): Promise<{ ms: number; value: T | null; err: string | null }> {
  const start = Date.now();
  try {
    const value = await fn();
    return { ms: Date.now() - start, value, err: null };
  } catch (e) {
    return {
      ms: Date.now() - start,
      value: null,
      err: e instanceof Error ? e.message : String(e),
    };
  }
}

async function httpProbe(
  url: string,
  init: RequestInit,
  acceptableStatuses: number[] = [200],
  timeoutMs = 8000,
): Promise<{ ok: boolean; status: number }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return { ok: acceptableStatuses.includes(res.status), status: res.status };
  } finally {
    clearTimeout(t);
  }
}

export async function runHealthChecksCore(
  serviceClient: ServiceRoleClient,
  config: HealthCheckConfig,
): Promise<{ status: number; results: HealthCheckOutcome[] }> {
  const startedAt = Date.now();
  const results: HealthCheckOutcome[] = [];
  const push = (
    key: HealthCheckKey,
    r: { ms: number; err: string | null },
    ok: boolean,
    detail?: Record<string, unknown>,
  ) => {
    results.push({
      key,
      ok,
      latencyMs: r.ms,
      detail: r.err ? { error: r.err, ...(detail ?? {}) } : (detail ?? null),
    });
  };

  // db
  const db = await timed(async () => {
    const { error } = await serviceClient
      .from("user_status")
      .select("id")
      .limit(1);
    if (error) throw new Error(error.message);
    return true;
  });
  push("db", db, db.value === true);

  // auth
  const auth = await timed(async () => {
    const { error } = await serviceClient.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });
    if (error) throw new Error(error.message);
    return true;
  });
  push("auth", auth, auth.value === true);

  // storage
  const storage = await timed(async () => {
    const { error } = await serviceClient.storage.listBuckets();
    if (error) throw new Error(error.message);
    return true;
  });
  push("storage", storage, storage.value === true);

  // payment providers: one check per provider, covering every enabled
  // account across the open markets (Admin › Markets decides which exist).
  // A provider is healthy only when each of its accounts has its
  // credentials set and answers an authenticated call.
  const providerOutcomes = new Map<
    "paystack" | "stripe",
    {
      ms: number;
      ok: boolean;
      markets: Record<string, string>;
      // "test" / "live" / "unknown" per key — never a key or a fragment.
      modes: Record<string, Record<string, string>>;
    }
  >();
  for (const market of await listOpenMarkets()) {
    for (const entry of await resolveMarketAccounts(market.countryCode)) {
      if (!entry.config.enabled) continue;
      const code = entry.config.provider;
      const agg = providerOutcomes.get(code) ?? {
        ms: 0,
        ok: true,
        markets: {},
        modes: {},
      };
      agg.modes[market.countryCode] = entry.modes;
      if (!entry.account) {
        agg.ok = false;
        agg.markets[market.countryCode] =
          entry.problem ?? `missing ${entry.missingEnv.join(", ")}`;
      } else {
        const account = entry.account;
        const probe = await timed(() =>
          getPaymentProvider(code).probe(account),
        );
        agg.ms = Math.max(agg.ms, probe.ms);
        const reachable = probe.value?.reachable ?? false;
        if (!reachable) agg.ok = false;
        agg.markets[market.countryCode] = reachable
          ? "ok"
          : (probe.value?.detail ?? probe.err ?? "unreachable");
      }
      providerOutcomes.set(code, agg);
    }
  }
  // A charge the provider took that nothing has settled two hours on — still
  // open, or recorded but never issued (fulfillment_failed): the
  // payment-reconcile sweep should have finished it, so a person must look
  // (Admin › Finance). Counted over the last week.
  const unsettled = await timed(async () => {
    const { count, error } = await serviceClient
      .from("payment_attempt")
      .select("id", { count: "exact", head: true })
      .eq("provider", "paystack")
      .in("status", [
        "initiated",
        "pending",
        "processing",
        "fulfillment_failed",
      ])
      .not("provider_reference", "is", null)
      .lt("created_at", new Date(Date.now() - 2 * 3_600_000).toISOString())
      .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
    if (error) throw new Error(error.message);
    return count ?? 0;
  });
  for (const [code, agg] of providerOutcomes) {
    const stuck = code === "paystack" ? (unsettled.value ?? 0) : 0;
    const ok = agg.ok && stuck === 0 && unsettled.err === null;
    push(
      code,
      {
        ms: agg.ms,
        err: ok
          ? null
          : !agg.ok
            ? "one or more market accounts failed"
            : "charged payments not settled",
      },
      ok,
      {
        markets: agg.markets,
        modes: agg.modes,
        declaredMode: config.paymentsMode ?? null,
        deployment: config.deploymentEnv ?? null,
        ...(code === "paystack" ? { unsettledPayments: unsettled.value } : {}),
      },
    );
  }

  // resend
  if (config.resendApiKey) {
    const rs = await timed(() =>
      httpProbe("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${config.resendApiKey}` },
      }),
    );
    push("resend", rs, rs.value?.ok ?? false, { httpStatus: rs.value?.status });
  }

  // cloudinary
  if (
    config.cloudinaryCloudName &&
    config.cloudinaryApiKey &&
    config.cloudinaryApiSecret
  ) {
    const basic = Buffer.from(
      `${config.cloudinaryApiKey}:${config.cloudinaryApiSecret}`,
    ).toString("base64");
    const cl = await timed(() =>
      httpProbe(
        `https://api.cloudinary.com/v1_1/${config.cloudinaryCloudName}/ping`,
        {
          headers: { Authorization: `Basic ${basic}` },
        },
      ),
    );
    push("cloudinary", cl, cl.value?.ok ?? false, {
      httpStatus: cl.value?.status,
    });
  }

  // hubtel (OTP/SMS) — auth ping only. The gateway can be slow to answer a
  // bare root GET, so give it a longer ceiling than the other probes and
  // treat "reachable (any HTTP response) = ok; only a network failure is
  // down" — a single slow response should not page anyone.
  if (config.hubtelClientId && config.hubtelClientSecret) {
    const basic = Buffer.from(
      `${config.hubtelClientId}:${config.hubtelClientSecret}`,
    ).toString("base64");
    const hb = await timed(() =>
      httpProbe(
        "https://api-otp.hubtel.com/",
        { method: "HEAD", headers: { Authorization: `Basic ${basic}` } },
        [200, 401, 403, 404, 405],
        10_000,
      ),
    );
    push("hubtel", hb, hb.err === null, { httpStatus: hb.value?.status });
  }

  // push (Expo) — reachability of the push endpoint
  const expo = await timed(() =>
    httpProbe(
      "https://exp.host/--/api/v2/push/getReceipts",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(config.expoAccessToken
            ? { Authorization: `Bearer ${config.expoAccessToken}` }
            : {}),
        },
        body: JSON.stringify({ ids: [] }),
      },
      [200, 400],
    ),
  );
  push("push", expo, expo.err === null && (expo.value?.ok ?? false), {
    httpStatus: expo.value?.status,
  });

  // rewards: the engine's queues are moving. Down when the oldest outbox
  // event has waited over 10 minutes, a due reward is over an hour late, or
  // anything was dead-lettered / released without its ledger journal.
  const rewards = await timed(async () => {
    const { data, error } = await serviceClient.rpc("rewards_health");
    if (error) throw new Error(error.message);
    return (data ?? {}) as Record<string, number>;
  });
  const rh = rewards.value;
  push(
    "rewards",
    rewards,
    !!rh &&
      Number(rh.outbox_lag_seconds ?? 0) <= 600 &&
      Number(rh.settlement_backlog ?? 0) === 0 &&
      Number(rh.outbox_dead_letters ?? 0) === 0 &&
      Number(rh.released_without_journal ?? 0) === 0,
    rh ?? undefined,
  );

  // fieldops: the commission sweep is running and nothing is stuck. Down
  // when the sweep has not finished in over an hour while the programme is
  // on, a run reported failures, work is overdue, or a successful
  // onboarding somehow has no commission behind it.
  const fieldops = await timed(async () => {
    const { data, error } = await serviceClient.rpc("fieldops_health");
    if (error) throw new Error(error.message);
    return (data ?? {}) as Record<string, number | boolean>;
  });
  const fh = fieldops.value;
  push(
    "fieldops",
    fieldops,
    !!fh &&
      // A switched-off programme is healthy by definition: the sweep is a
      // deliberate no-op, so its lag means nothing.
      (fh.enabled !== true ||
        (Number(fh.sweep_lag_seconds ?? 0) <= 3600 &&
          Number(fh.sweep_failures ?? 0) === 0 &&
          Number(fh.due_not_swept ?? 0) === 0 &&
          Number(fh.succeeded_without_commission ?? 0) === 0 &&
          Number(fh.approved_without_rule ?? 0) === 0)),
    fh ?? undefined,
  );

  // weekly: Abonten Weekly is keeping to its schedule. A switched-off
  // programme is healthy by definition. When it is on: down if a scheduled
  // edition is over 15 minutes late (the job failed or refused it) or if no
  // Ghana-wide edition is published for this week by 09:00 Accra on Monday.
  const weekly = await timed(async () => {
    const { data, error } = await serviceClient.rpc("weekly_health");
    if (error) throw new Error(error.message);
    return (data ?? {}) as Record<string, number | boolean | string | null>;
  });
  const wh = weekly.value;
  push(
    "weekly",
    weekly,
    !!wh &&
      (wh.enabled !== true ||
        (Number(wh.scheduled_overdue ?? 0) === 0 &&
          (wh.national_published === true ||
            Number(wh.hours_into_week ?? 0) < 9))),
    wh ?? undefined,
  );

  // `self` = "the health endpoint ran to completion". Written here so the
  // Admin Monitor shows Endpoint reachability = ok whenever this function
  // finishes — independent of whether the pg_cron caller's HTTP client
  // waited long enough for the response. The cron only ever writes a
  // `self` = down row (401 / unreachable / no response); it never writes
  // the ok row, so the two can't race.
  results.push({
    key: "self",
    ok: true,
    latencyMs: Date.now() - startedAt,
    detail: { source: "endpoint", checks: results.length },
  });

  const write = await recordHealthResultsCore(serviceClient, results);
  return { status: write.status === 200 ? 200 : 500, results };
}
