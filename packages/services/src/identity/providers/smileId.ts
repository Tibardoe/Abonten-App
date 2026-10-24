import { createHmac, timingSafeEqual } from "node:crypto";
import { fetchWithTimeout } from "@abonten/core/http/fetchWithTimeout";
import { isoDateOrNull } from "@abonten/core/identity/rules";
import type { IdentityResultStatus } from "@abonten/types/identityType";
import type {
  CreateIdentitySessionInput,
  CreateIdentitySessionResult,
  IdentityProviderAdapter,
  IdentityProviderResult,
  VerifiedCallback,
} from "./types";

// Smile ID (v3 API), the identity provider for Ghana and the other African
// markets: https://docs.usesmileid.com. A check is a single-use Smile Link —
// Smile ID's hosted page takes the document and the selfie — and the verdict
// comes back as a webhook.
//
//   POST /v3/token            short-lived JWT (15 min) from partner id + API key
//   POST /v3/smile_links      the person's single-use link
//   GET  /v3/status/{jobId}   the verdict, asked server to server
//
// The webhook's Response-Signature is an HMAC-SHA256 (key: the API key) of
// Response-Timestamp + partner id + "sid_request": it proves the sender
// knows the key, but it does NOT cover the body. So the timestamp must be
// fresh, the attempt must be one we created, and the verdict is confirmed
// with GET /v3/status before anything is decided on it.
//
// Written against the published API (2026-10); not yet run against a live
// Smile ID account: the founder signs the contract, asks Smile ID to enable
// Ghana, and sets the variables below.

export const SMILE_ID_ENV = {
  partnerId: "SMILE_ID_PARTNER_ID",
  apiKey: "SMILE_ID_API_KEY",
  environment: "SMILE_ID_ENVIRONMENT",
} as const;

const TIMEOUT_MS = 12_000;
const TOKEN_REUSE_MS = 10 * 60_000;
/** How old a webhook's timestamp may be (retries and replays included). */
export const SMILE_CALLBACK_MAX_AGE_MS = 60 * 60_000;

type Credentials = { partnerId: string; apiKey: string; baseUrl: string };

function credentials(): Credentials | null {
  const partnerId = process.env[SMILE_ID_ENV.partnerId]?.trim();
  const apiKey = process.env[SMILE_ID_ENV.apiKey]?.trim();
  if (!partnerId || !apiKey || !/^[1-9]\d*$/.test(partnerId)) return null;
  const production =
    process.env[SMILE_ID_ENV.environment]?.trim() === "production";
  return {
    partnerId,
    apiKey,
    baseUrl: production
      ? "https://api.smileidentity.com"
      : "https://testapi.smileidentity.com",
  };
}

let tokenCache: { token: string; at: number; key: string } | null = null;

async function token(c: Credentials): Promise<string> {
  const key = `${c.baseUrl}:${c.partnerId}`;
  if (
    tokenCache &&
    tokenCache.key === key &&
    Date.now() - tokenCache.at < TOKEN_REUSE_MS
  ) {
    return tokenCache.token;
  }
  const res = await fetchWithTimeout(`${c.baseUrl}/v3/token`, {
    method: "POST",
    headers: {
      "smileid-partner-id": c.partnerId,
      "smileid-api-key": c.apiKey,
    },
    timeoutMs: TIMEOUT_MS,
  });
  const body = (await res.json().catch(() => null)) as {
    token?: string;
  } | null;
  if (!res.ok || !body?.token) {
    throw new Error(`Smile ID token refused (HTTP ${res.status})`);
  }
  tokenCache = { token: body.token, at: Date.now(), key };
  return body.token;
}

/** Test hook. */
export function resetSmileIdTokenCache(): void {
  tokenCache = null;
}

/** Response-Signature for a timestamp, as Smile ID computes it. */
export function smileCallbackSignature(
  timestamp: string,
  partnerId: string,
  apiKey: string,
): string {
  return createHmac("sha256", apiKey)
    .update(timestamp)
    .update(partnerId)
    .update("sid_request")
    .digest("base64");
}

function sameSignature(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const RESULT_STATUSES = ["clear", "attention", "block", "error"];

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** The webhook body reduced to what Abonten acts on. Exported for tests. */
export function parseSmileResult(
  body: Record<string, unknown>,
  headers?: Headers,
): IdentityProviderResult {
  const params = (body.partner_params ?? {}) as Record<string, unknown>;
  const fields = (body.id_fields ?? {}) as Record<string, unknown>;
  const antifraud = (body.antifraud ?? {}) as {
    fraud_risk?: { risk_level?: unknown };
    summary?: { fraud_detected?: unknown };
    smile_secure?: { status?: unknown; suspect_users?: unknown };
  };
  const status = text(body.status);
  const fullName =
    text(fields.full_name) ??
    ([fields.first_name, fields.other_names, fields.last_name]
      .map(text)
      .filter(Boolean)
      .join(" ") ||
      null);
  const suspects = antifraud.smile_secure?.suspect_users;
  return {
    providerJobId:
      headers?.get("smileid-job-id")?.trim() || text(params.job_id) || null,
    providerUserRef:
      headers?.get("user-id")?.trim() || text(params.user_id) || null,
    verificationId: text(params.abonten_verification_id),
    status:
      status && RESULT_STATUSES.includes(status)
        ? (status as IdentityResultStatus)
        : "processing",
    reason: text(body.reason)?.toLowerCase() ?? null,
    riskLevel: text(antifraud.fraud_risk?.risk_level)?.toLowerCase() ?? null,
    fraudDetected:
      typeof antifraud.summary?.fraud_detected === "boolean"
        ? antifraud.summary.fraud_detected
        : null,
    providerDuplicate: Array.isArray(suspects) ? suspects.length > 0 : null,
    fullName,
    dateOfBirth: isoDateOrNull(fields.date_of_birth),
    idNumber: text(fields.id_number),
    documentExpiresOn: isoDateOrNull(fields.expiration_date),
  };
}

export const smileIdProvider: IdentityProviderAdapter = {
  key: "smile_id",

  isConfigured() {
    return credentials() !== null;
  },

  async createSession(
    input: CreateIdentitySessionInput,
  ): Promise<CreateIdentitySessionResult> {
    const c = credentials();
    if (!c) {
      return {
        ok: false,
        reason: "not_configured",
        detail: "Smile ID is not configured",
      };
    }
    try {
      const form = new FormData();
      form.append(
        "id_types",
        JSON.stringify([
          {
            country: input.country,
            id_type: input.documentType,
            verification_method: input.method,
          },
        ]),
      );
      form.append("name", "Abonten identity check");
      form.append("notice_privacy_policy_url", input.privacyPolicyUrl);
      form.append("is_single_use", "true");
      form.append("callback_url", input.callbackUrl);
      form.append("redirect_url", input.redirectUrl);
      form.append("logo_url", input.logoUrl);
      form.append("expires_at", input.expiresAt);
      form.append("user_id", input.providerUserRef);
      form.append(
        "partner_params",
        JSON.stringify({ abonten_verification_id: input.verificationId }),
      );
      const res = await fetchWithTimeout(`${c.baseUrl}/v3/smile_links`, {
        method: "POST",
        headers: {
          "SmileID-Partner-ID": c.partnerId,
          "SmileID-Token": await token(c),
        },
        body: form,
        timeoutMs: TIMEOUT_MS,
      });
      const body = (await res.json().catch(() => null)) as {
        link?: string;
        ref_id?: string;
        message?: string;
      } | null;
      if (!res.ok || !body?.link || !body.ref_id) {
        return {
          ok: false,
          reason: "refused",
          detail: `HTTP ${res.status}: ${body?.message ?? "no link"}`,
        };
      }
      return {
        ok: true,
        url: body.link,
        linkRef: body.ref_id,
        expiresAt: input.expiresAt,
      };
    } catch (error) {
      return {
        ok: false,
        reason: "unreachable",
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  },

  verifyCallback(headers, rawBody, now = Date.now()): VerifiedCallback {
    const c = credentials();
    if (!c) {
      return {
        ok: false,
        reason: "signature",
        detail: "Smile ID is not configured",
      };
    }
    const signature = headers.get("response-signature")?.trim();
    const timestamp = headers.get("response-timestamp")?.trim();
    if (!signature || !timestamp) {
      return { ok: false, reason: "signature", detail: "missing signature" };
    }
    const expected = smileCallbackSignature(timestamp, c.partnerId, c.apiKey);
    if (!sameSignature(signature, expected)) {
      return { ok: false, reason: "signature", detail: "bad signature" };
    }
    const at = Date.parse(timestamp);
    if (Number.isNaN(at) || Math.abs(now - at) > SMILE_CALLBACK_MAX_AGE_MS) {
      return { ok: false, reason: "stale", detail: "old timestamp" };
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return { ok: false, reason: "malformed", detail: "not JSON" };
    }
    if (!body || typeof body !== "object") {
      return { ok: false, reason: "malformed", detail: "not an object" };
    }
    return { ok: true, result: parseSmileResult(body, headers) };
  },

  async fetchStatus(jobId) {
    const c = credentials();
    if (!c) return { ok: false, detail: "Smile ID is not configured" };
    if (!/^[A-Za-z0-9_-]{4,80}$/.test(jobId)) {
      return { ok: false, detail: "bad job id" };
    }
    try {
      const res = await fetchWithTimeout(
        `${c.baseUrl}/v3/status/${encodeURIComponent(jobId)}`,
        {
          method: "GET",
          headers: {
            "SmileID-Partner-ID": c.partnerId,
            "SmileID-Token": await token(c),
          },
          timeoutMs: TIMEOUT_MS,
        },
      );
      if (res.status === 404) return { ok: true, status: "not_found" };
      const body = (await res.json().catch(() => null)) as {
        status?: string;
      } | null;
      if (res.status === 202) return { ok: true, status: "processing" };
      if (!res.ok || !body?.status) {
        return { ok: false, detail: `HTTP ${res.status}` };
      }
      return RESULT_STATUSES.includes(body.status)
        ? { ok: true, status: body.status as IdentityResultStatus }
        : { ok: true, status: "processing" };
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
