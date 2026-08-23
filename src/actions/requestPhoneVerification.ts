"use server";

import { sendHubtelOtp } from "@/services/hubtelOtpClient";
import {
  type PhoneOtpPurpose,
  getResendCooldownRemainingMs,
  recordOtpSent,
} from "@/services/phoneOtpStore";
import { normalizePhoneNumber } from "@/utils/normalizePhoneNumber";

export type RequestPhoneVerificationResult =
  | { status: 200; phoneE164: string }
  | { status: 400 | 429 | 500; message: string };

// Shared by both phone sign-in (AuthModal) and Settings -> Security's add/
// change-phone flow. Normalizes the number, applies the resend cooldown,
// and asks Hubtel to send the code -- the requestId/prefix Hubtel returns
// are kept server-side (src/services/phoneOtpStore.ts) and never sent to
// the client.
export default async function requestPhoneVerification(
  dialCode: string,
  rawPhone: string,
  purpose: PhoneOtpPurpose,
): Promise<RequestPhoneVerificationResult> {
  const normalized = normalizePhoneNumber(dialCode, rawPhone);

  if (!normalized.ok) {
    return { status: 400, message: normalized.error };
  }

  const cooldownRemainingMs = getResendCooldownRemainingMs(
    purpose,
    normalized.e164,
  );

  if (cooldownRemainingMs > 0) {
    return {
      status: 429,
      message: `Please wait ${Math.ceil(cooldownRemainingMs / 1000)}s before requesting another code.`,
    };
  }

  const result = await sendHubtelOtp(normalized.e164);

  if (!result.ok) {
    return { status: 500, message: result.message };
  }

  recordOtpSent(purpose, normalized.e164, result.requestId, result.prefix);

  return { status: 200, phoneE164: normalized.e164 };
}
