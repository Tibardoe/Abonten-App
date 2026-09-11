import { logger } from "@abonten/core/logger";
import type { HealthCheckKey } from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
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
  paystackSecretKey?: string;
  resendApiKey?: string;
  cloudinaryCloudName?: string;
  cloudinaryApiKey?: string;
  cloudinaryApiSecret?: string;
  hubtelClientId?: string;
  hubtelClientSecret?: string;
  expoAccessToken?: string;
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

  // paystack
  if (config.paystackSecretKey) {
    const ps = await timed(() =>
      httpProbe("https://api.paystack.co/bank?perPage=1", {
        headers: { Authorization: `Bearer ${config.paystackSecretKey}` },
      }),
    );
    push("paystack", ps, ps.value?.ok ?? false, {
      httpStatus: ps.value?.status,
    });
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
