// Sending a sign-in / phone-change / consent code: the one implementation
// behind the web action and the mobile route. Normalises the number for the
// picker's country (libphonenumber), applies the per-number resend
// cooldown, routes to the market's OTP provider and records the pending
// handle server-side. The per-IP cap and the send log stay in the transport
// (it is what knows the caller's IP). Deliberately NOT a "use server" file.

import {
  PHONE_ERROR_MESSAGE,
  parsePhoneWithDialCode,
} from "@abonten/core/phone/phone";
import { routeOtpForPhone } from "./otpProviders/otpRouter";
import {
  type PhoneOtpPurpose,
  getResendCooldownRemainingMs,
  recordOtpSent,
} from "./phoneOtpStore";

export type PhoneOtpSendResult =
  | { status: 200; phoneE164: string; codeLength: number; provider: string }
  | { status: 400 | 429 | 500 | 503; message: string };

export async function sendPhoneOtpCore(input: {
  dialCode: string;
  rawPhone: string;
  purpose: PhoneOtpPurpose;
  /** Runs after normalisation, before the send: the transport's IP cap. */
  beforeSend?: (
    phoneE164: string,
  ) => Promise<{ status: 429; message: string } | null>;
}): Promise<PhoneOtpSendResult> {
  const parsed = parsePhoneWithDialCode(input.dialCode, input.rawPhone);
  if (!parsed.ok) {
    return { status: 400, message: PHONE_ERROR_MESSAGE[parsed.error] };
  }
  const phoneE164 = parsed.e164;

  const cooldownRemainingMs = await getResendCooldownRemainingMs(
    input.purpose,
    phoneE164,
  );
  if (cooldownRemainingMs > 0) {
    return {
      status: 429,
      message: `Please wait ${Math.ceil(cooldownRemainingMs / 1000)}s before requesting another code.`,
    };
  }

  const gate = input.beforeSend ? await input.beforeSend(phoneE164) : null;
  if (gate) return gate;

  const route = await routeOtpForPhone(phoneE164);
  if (!route.ok) {
    return {
      status: route.reason === "not_configured" ? 503 : 400,
      message: route.message,
    };
  }

  const sent = await route.provider.send(phoneE164, route.countryCode);
  if (!sent.ok) {
    return {
      status: sent.reason === "unsupported_number" ? 400 : 500,
      message: sent.message,
    };
  }

  await recordOtpSent(
    input.purpose,
    phoneE164,
    sent.requestId,
    sent.prefix,
    route.provider.code,
  );

  return {
    status: 200,
    phoneE164,
    codeLength: route.provider.codeLength(),
    provider: route.provider.code,
  };
}

/**
 * Checks a code against the provider that sent it. Shared by sign-in,
 * phone change and the Field Ops owner consent.
 */
export async function verifyPendingOtp(
  pending: { provider: string; requestId: string; prefix: string },
  code: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { getOtpProvider } = await import("./otpProviders/otpRouter");
  const provider = getOtpProvider(pending.provider);
  if (!provider) {
    return { ok: false, message: "That code has expired. Request a new one." };
  }
  if (!new RegExp(`^\\d{${provider.codeLength()}}$`).test(code)) {
    return {
      ok: false,
      message: `Enter the ${provider.codeLength()}-digit code.`,
    };
  }
  return provider.verify(pending.requestId, pending.prefix, code);
}
