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
import { logger } from "@abonten/core/logger";
import { tr } from "../../i18n/requestLocale";
import {
  deriveSigningKey,
  hmacBase64Url,
  signaturesMatch,
} from "../../security/signing";
import {
  HUBTEL_SMS_ENV,
  isHubtelSmsConfigured,
  sendHubtelSms,
} from "../../sms/hubtelSms";
import { PENDING_OTP_TTL_MS } from "../phoneOtpStore";
import type { OtpProvider, OtpSendResult, OtpVerifyResult } from "./types";

const CODE_LENGTH = 6;
// Marks a pending code this provider issued. One still pending from the old
// OTP product has no marker and is treated as expired.
const HASH_VERSION = "h1.";

function codeHash(requestId: string, code: string): string {
  return `${HASH_VERSION}${hmacBase64Url(deriveSigningKey("phone-otp:v1"), `${requestId}:${code}`)}`;
}

/** Plain ASCII keeps it one GSM-7 segment (an en dash or curly quote would double the price). */
export function otpMessage(code: string): string {
  const minutes = Math.round(PENDING_OTP_TTL_MS / 60_000);
  return tr("yourAbontenCodeIsItExpires", { code: code, minutes: minutes });
}

export const hubtelOtpProvider: OtpProvider = {
  code: "hubtel",

  isConfigured() {
    return isHubtelSmsConfigured();
  },

  requiredEnv() {
    return [...HUBTEL_SMS_ENV];
  },

  codeLength() {
    return CODE_LENGTH;
  },

  async send(phoneE164): Promise<OtpSendResult> {
    if (!isHubtelSmsConfigured()) {
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
    // A timeout may still have texted; the send has been counted either
    // way and is not retried here (a retry is a second paid message).
    const sent = await sendHubtelSms({
      toE164: phoneE164,
      content: otpMessage(code),
      clientReference: requestId,
    });
    if (!sent.ok) {
      logger.error(sent.detail);
      return {
        ok: false,
        reason:
          sent.reason === "not_configured"
            ? "not_configured"
            : "provider_error",
        message:
          sent.reason === "not_configured"
            ? tr("somethingWentWrongPleaseTryAgain")
            : tr("couldnTSendTheVerificationCode"),
        detail: sent.detail,
      };
    }
    logger.info("Hubtel SMS code accepted", { messageId: sent.messageId });
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
