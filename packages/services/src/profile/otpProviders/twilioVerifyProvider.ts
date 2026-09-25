// Twilio Verify (docs: twilio.com/docs/verify/api) — one-time codes by SMS
// to any country Twilio delivers to. Twilio generates and checks the code;
// Abonten stores the Verification SID it returns. Plain fetch against the
// REST API with Basic auth, the same way the payment adapters work.
//
// Environment: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID
// (a Verify Service created in the Twilio console). Without them the
// provider reports itself unconfigured and readiness shows phone sign-in
// as unavailable for the markets that route here.

import {
  HTTP_TIMEOUTS,
  fetchWithTimeout,
} from "@abonten/core/http/fetchWithTimeout";
import { logger } from "@abonten/core/logger";
import type { OtpProvider, OtpSendResult, OtpVerifyResult } from "./types";

const TWILIO_CODE_LENGTH = 6;

function credentials(): {
  accountSid: string;
  authToken: string;
  serviceSid: string;
} | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!accountSid || !authToken || !serviceSid) return null;
  return { accountSid, authToken, serviceSid };
}

async function twilioPost(
  path: string,
  form: Record<string, string>,
  creds: { accountSid: string; authToken: string; serviceSid: string },
): Promise<{
  ok: boolean;
  status: number;
  json: Record<string, unknown> | null;
}> {
  const res = await fetchWithTimeout(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(creds.serviceSid)}${path}`,
    {
      timeoutMs: HTTP_TIMEOUTS.hubtelOtp,
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(form).toString(),
    },
  );
  const json = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  return { ok: res.ok, status: res.status, json };
}

export const twilioVerifyProvider: OtpProvider = {
  code: "twilio",

  isConfigured() {
    return credentials() !== null;
  },

  requiredEnv() {
    return [
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_VERIFY_SERVICE_SID",
    ];
  },

  codeLength() {
    return TWILIO_CODE_LENGTH;
  },

  async send(phoneE164): Promise<OtpSendResult> {
    const creds = credentials();
    if (!creds) {
      logger.error("Twilio Verify credentials are not configured.");
      return {
        ok: false,
        reason: "not_configured",
        message: "Something went wrong. Please try again.",
      };
    }
    const { ok, status, json } = await twilioPost(
      "/Verifications",
      { To: phoneE164, Channel: "sms" },
      creds,
    );
    const sid = typeof json?.sid === "string" ? json.sid : null;
    if (!ok || !sid) {
      // 60200/60203: invalid or blocked number — a person-facing reason.
      const code = typeof json?.code === "number" ? json.code : null;
      logger.error(
        `Twilio Verify send failed (${status} ${code ?? ""}): ${json?.message ?? "unknown"}`,
      );
      return {
        ok: false,
        reason:
          code === 60200 || code === 60203
            ? "unsupported_number"
            : "provider_error",
        message:
          code === 60200
            ? "That phone number can't receive verification codes."
            : "Couldn't send the verification code. Please try again.",
      };
    }
    // Twilio has no prefix; the SID is the request handle.
    return { ok: true, requestId: sid, prefix: "" };
  },

  async verify(_requestId, _prefix, code): Promise<OtpVerifyResult> {
    // Twilio checks by phone number, which the caller stored alongside the
    // request; the SID is enough to identify the verification.
    const creds = credentials();
    if (!creds) {
      logger.error("Twilio Verify credentials are not configured.");
      return { ok: false, message: "Something went wrong. Please try again." };
    }
    const { ok, json } = await twilioPost(
      "/VerificationCheck",
      { VerificationSid: _requestId, Code: code },
      creds,
    );
    if (!ok || json?.status !== "approved") {
      return { ok: false, message: "That code is incorrect." };
    }
    return { ok: true };
  },
};
