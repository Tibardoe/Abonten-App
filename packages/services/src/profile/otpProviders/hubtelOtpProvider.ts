// Ghana text-message codes. Abonten makes the code; Hubtel's SMS API only
// carries it (POST sms.hubtel.com/v1/messages/send, Basic auth).
//
// Until 2026-09-29 this called Hubtel's separate OTP product
// (api-otp.hubtel.com/otp/{send,verify}), which generated and checked the
// code itself. That day it answered every send with success ("0000" and a
// requestId) and delivered nothing, while a plain text through the SMS API,
// on the same account, reached the same phone in six seconds. Nothing on
// Abonten's side could tell the two apart, so phone sign-in was down with
// every check green.
//
// The code is six digits from node:crypto. Only an HMAC of it is kept, in
// phone_otp_state.prefix, bound to the send's random handle (request_id)
// with a key derived from the service-role key, so the table never holds a
// usable code. Expiry (5 minutes), the guess budget, the resend cooldown and
// the send caps are phoneOtpStore's, and a verified code is deleted there so
// it cannot be replayed.

import { randomBytes, randomInt } from "node:crypto";
import {
  HTTP_TIMEOUTS,
  fetchWithTimeout,
} from "@abonten/core/http/fetchWithTimeout";
import { logger } from "@abonten/core/logger";
import { tr } from "../../i18n/requestLocale";
import {
  deriveSigningKey,
  hmacBase64Url,
  signaturesMatch,
} from "../../security/signing";
import { PENDING_OTP_TTL_MS } from "../phoneOtpStore";
import type { OtpProvider, OtpSendResult, OtpVerifyResult } from "./types";

const HUBTEL_SMS_SEND_URL = "https://sms.hubtel.com/v1/messages/send";
const CODE_LENGTH = 6;
// Hubtel's ceiling for an alphanumeric sender ID. The ID must also be one
// Hubtel has approved for the account; an unapproved one is dropped by the
// networks without an error.
const SENDER_ID_MAX_LENGTH = 11;
// Marks a pending code this provider issued. One still pending from the old
// OTP product has no marker and is treated as expired.
const HASH_VERSION = "h1.";

type HubtelSmsSendResponse = {
  messageId?: string | null;
  status?: number | string;
  statusDescription?: string;
};

function config(): {
  clientId: string;
  clientSecret: string;
  senderId: string;
} | null {
  const clientId = process.env.HUBTEL_API_CLIENT_ID;
  const clientSecret = process.env.HUBTEL_API_CLIENT_SECRET;
  const senderId = process.env.HUBTEL_SMS_SENDER_ID?.trim();
  if (!clientId || !clientSecret || !senderId) return null;
  if (senderId.length > SENDER_ID_MAX_LENGTH) {
    logger.error(
      `HUBTEL_SMS_SENDER_ID is ${senderId.length} characters; Hubtel allows ${SENDER_ID_MAX_LENGTH}.`,
    );
    return null;
  }
  return { clientId, clientSecret, senderId };
}

function codeHash(requestId: string, code: string): string {
  return `${HASH_VERSION}${hmacBase64Url(deriveSigningKey("phone-otp:v1"), `${requestId}:${code}`)}`;
}

/** Plain ASCII keeps it one GSM-7 segment (an en dash or curly quote would double the price). */
export function otpMessage(code: string): string {
  const minutes = Math.round(PENDING_OTP_TTL_MS / 60_000);
  return `Your Abonten code is ${code}. It expires in ${minutes} minutes. Don't share it with anyone.`;
}

// Hubtel's numeric `status`: 0 accepted, 1 accepted for delivery. It says
// the request was taken, not that the phone received anything. A missing,
// null or empty status is not acceptance (Number() would read those as 0).
function accepted(status: unknown): boolean {
  const value =
    typeof status === "number"
      ? status
      : typeof status === "string" && status.trim() !== ""
        ? Number(status)
        : Number.NaN;
  return value === 0 || value === 1;
}

export const hubtelOtpProvider: OtpProvider = {
  code: "hubtel",

  isConfigured() {
    return config() !== null;
  },

  requiredEnv() {
    return [
      "HUBTEL_API_CLIENT_ID",
      "HUBTEL_API_CLIENT_SECRET",
      "HUBTEL_SMS_SENDER_ID",
    ];
  },

  codeLength() {
    return CODE_LENGTH;
  },

  async send(phoneE164): Promise<OtpSendResult> {
    const creds = config();
    if (!creds) {
      logger.error("Hubtel SMS credentials or sender ID are not configured.");
      return {
        ok: false,
        reason: "not_configured",
        message: tr("somethingWentWrongPleaseTryAgain"),
      };
    }
    const code = String(randomInt(0, 10 ** CODE_LENGTH)).padStart(
      CODE_LENGTH,
      "0",
    );
    const requestId = randomBytes(16).toString("hex");
    // Before the text goes out, so a missing signing key cannot leave a
    // paid message with no way to check it.
    const prefix = codeHash(requestId, code);
    let response: Response;
    let body: HubtelSmsSendResponse | null;
    try {
      response = await fetchWithTimeout(HUBTEL_SMS_SEND_URL, {
        timeoutMs: HTTP_TIMEOUTS.hubtelOtp,
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}`,
        },
        // The body holds the code: never log it or put it in an error.
        body: JSON.stringify({
          From: creds.senderId,
          To: phoneE164.replace(/\D/g, ""),
          Content: otpMessage(code),
          ClientReference: requestId,
        }),
      });
      body = (await response
        .json()
        .catch(() => null)) as HubtelSmsSendResponse | null;
    } catch (error) {
      // A timeout may still have texted; the send has been counted either
      // way and is not retried here (a retry is a second paid message).
      const detail = `Hubtel SMS send did not complete: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(detail);
      return {
        ok: false,
        reason: "provider_error",
        message: tr("couldnTSendTheVerificationCode"),
        detail,
      };
    }
    // An unfunded account is HTTP 400 with status 12 "Payment required on
    // account" (seen 2026-09-20), so both numbers go into the detail.
    if (!response.ok || !body || !accepted(body.status)) {
      const detail = `Hubtel SMS send refused (HTTP ${response.status}, status ${body?.status ?? "none"}): ${body?.statusDescription ?? "no readable body"}`;
      logger.error(detail);
      return {
        ok: false,
        reason: "provider_error",
        message: tr("couldnTSendTheVerificationCode"),
        detail,
      };
    }
    logger.info("Hubtel SMS code accepted", {
      messageId: body.messageId ?? null,
    });
    return { ok: true, requestId, prefix };
  },

  async verify(requestId, prefix, code): Promise<OtpVerifyResult> {
    if (!prefix.startsWith(HASH_VERSION)) {
      return {
        ok: false,
        message: tr("thatCodeHasExpiredRequestA"),
      };
    }
    return signaturesMatch(codeHash(requestId, code), prefix)
      ? { ok: true }
      : { ok: false, message: tr("thatCodeIsIncorrect") };
  },
};
