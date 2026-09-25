// Hubtel's OTP API (Ghana). Hubtel generates and stores the code; Abonten
// keeps the requestId/prefix it returns and forwards the person's answer.
// Kept exactly as it was integrated; only wrapped behind OtpProvider.

import {
  HTTP_TIMEOUTS,
  fetchWithTimeout,
} from "@abonten/core/http/fetchWithTimeout";
import { logger } from "@abonten/core/logger";
import type { OtpProvider, OtpSendResult, OtpVerifyResult } from "./types";

const HUBTEL_OTP_SEND_URL = "https://api-otp.hubtel.com/otp/send";
const HUBTEL_OTP_VERIFY_URL = "https://api-otp.hubtel.com/otp/verify";
// Hubtel's OTP product issues 4-digit codes.
const HUBTEL_OTP_CODE_LENGTH = 4;

type HubtelOtpSendResponse = {
  code: string;
  message: string;
  data?: { prefix: string; requestId: string };
};

function credentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.HUBTEL_API_CLIENT_ID;
  const clientSecret = process.env.HUBTEL_API_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

function authHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export const hubtelOtpProvider: OtpProvider = {
  code: "hubtel",

  isConfigured() {
    return credentials() !== null;
  },

  requiredEnv() {
    return ["HUBTEL_API_CLIENT_ID", "HUBTEL_API_CLIENT_SECRET"];
  },

  codeLength() {
    return HUBTEL_OTP_CODE_LENGTH;
  },

  async send(phoneE164, countryCode): Promise<OtpSendResult> {
    const creds = credentials();
    if (!creds) {
      logger.error("Hubtel API credentials are not configured.");
      return {
        ok: false,
        reason: "not_configured",
        message: "Something went wrong. Please try again.",
      };
    }
    const response = await fetchWithTimeout(HUBTEL_OTP_SEND_URL, {
      timeoutMs: HTTP_TIMEOUTS.hubtelOtp,
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: authHeader(creds.clientId, creds.clientSecret),
      },
      body: JSON.stringify({
        senderId: creds.clientId,
        phoneNumber: phoneE164,
        countryCode,
      }),
    });
    const data = (await response.json()) as HubtelOtpSendResponse;
    if (data.code !== "0000" || !data.data?.requestId || !data.data?.prefix) {
      logger.error(`Hubtel OTP send failed: ${data.message}`);
      return {
        ok: false,
        reason: "provider_error",
        message: "Couldn't send the verification code. Please try again.",
      };
    }
    return {
      ok: true,
      requestId: data.data.requestId,
      prefix: data.data.prefix,
    };
  },

  async verify(requestId, prefix, code): Promise<OtpVerifyResult> {
    const creds = credentials();
    if (!creds) {
      logger.error("Hubtel API credentials are not configured.");
      return { ok: false, message: "Something went wrong. Please try again." };
    }
    const response = await fetchWithTimeout(HUBTEL_OTP_VERIFY_URL, {
      timeoutMs: HTTP_TIMEOUTS.hubtelOtp,
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: authHeader(creds.clientId, creds.clientSecret),
      },
      body: JSON.stringify({ requestId, prefix, code }),
    });
    if (response.status !== 200) {
      return { ok: false, message: "That code is incorrect." };
    }
    return { ok: true };
  },
};
