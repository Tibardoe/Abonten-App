// Sign-in for app store reviewers. App Review needs a demo account
// (Guideline 2.1(a)), and Abonten signs people in only with one-time codes
// its reviewers cannot receive. So one configured number gets a fixed code
// instead of a text message: APP_REVIEW_PHONE_E164 + APP_REVIEW_OTP_CODE
// (6 digits), set on Vercel Production only. Unset or malformed, this is off.
//
// otpRouter routes only a sign-in here — never a phone change or a Field Ops
// owner's consent, where a code anyone can read would prove nothing — and
// the usual limits still hold (5 guesses a code, 10 codes a day for the
// number). Runbook: docs/deployment/mobile-eas.md, "App Review sign-in".

import { randomBytes, timingSafeEqual } from "node:crypto";
import { logger } from "@abonten/core/logger";
import type { OtpProvider, OtpSendResult, OtpVerifyResult } from "./types";

// The app's code boxes are sized for at most six digits on a phone.
const APP_REVIEW_CODE_LENGTH = 6;
const CODE_PATTERN = new RegExp(`^\\d{${APP_REVIEW_CODE_LENGTH}}$`);
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

function reviewConfig(): { phoneE164: string; code: string } | null {
  const phoneE164 = process.env.APP_REVIEW_PHONE_E164?.trim();
  const code = process.env.APP_REVIEW_OTP_CODE?.trim();
  if (!phoneE164 || !code) return null;
  if (!E164_PATTERN.test(phoneE164) || !CODE_PATTERN.test(code)) {
    logger.error(
      "App Review sign-in is misconfigured (APP_REVIEW_PHONE_E164 must be E.164, APP_REVIEW_OTP_CODE six digits); it stays off.",
    );
    return null;
  }
  return { phoneE164, code };
}

/** True only for the configured review number while both settings are valid. */
export function isAppReviewPhone(phoneE164: string): boolean {
  return reviewConfig()?.phoneE164 === phoneE164;
}

export const appReviewOtpProvider: OtpProvider = {
  code: "app_review",

  isConfigured() {
    return reviewConfig() !== null;
  },

  requiredEnv() {
    return ["APP_REVIEW_PHONE_E164", "APP_REVIEW_OTP_CODE"];
  },

  codeLength() {
    return APP_REVIEW_CODE_LENGTH;
  },

  async send(phoneE164): Promise<OtpSendResult> {
    if (!isAppReviewPhone(phoneE164)) {
      return {
        ok: false,
        reason: "not_configured",
        message: "Something went wrong. Please try again.",
      };
    }
    // Nothing is texted. The handle only ties the pending row to this send.
    logger.info("App Review sign-in code requested", {
      security: { event: "app_review_code_requested" },
    });
    return {
      ok: true,
      requestId: randomBytes(16).toString("hex"),
      prefix: "review",
    };
  },

  async verify(_requestId, _prefix, code): Promise<OtpVerifyResult> {
    const config = reviewConfig();
    // Switched off after the code was requested: the pending code dies too.
    const matches =
      config !== null &&
      code.length === config.code.length &&
      timingSafeEqual(Buffer.from(code), Buffer.from(config.code));
    logger.info("App Review sign-in code checked", {
      security: { event: "app_review_code_checked", matched: matches },
    });
    return matches
      ? { ok: true }
      : { ok: false, message: "That code is incorrect." };
  },
};
