// Server-only, durable pending-OTP store, backed by the phone_otp_state
// Postgres table (see supabase/migrations/20260902100000_durable_phone_otp_state.sql).
// Holds the provider's request handle (Hubtel requestId/prefix, Twilio
// Verification SID) returned by a successful send, keyed by phone number +
// purpose, so the client never receives it (it only ever sends {phone,
// code} to verify) and so a resend/replay can't reuse an already-consumed
// code. The provider that sent the code is recorded with it, so the check
// goes back to the same one whichever market the number belongs to.
//
// Previously an in-memory Map -- fine on a single long-lived process, but
// silently broken across multiple server instances. Moved to Postgres,
// queried only through the service-role client, so this state is shared
// and authoritative regardless of which instance handles a given request.

import { logger } from "@abonten/core/logger";
import type { OtpProviderCode } from "@abonten/core/market/types";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";

// "fieldops-owner": the business owner's consent code in a Field Ops
// onboarding (migration fieldops_onboarding widened the CHECK).
export type PhoneOtpPurpose = "sign-in" | "phone-update" | "fieldops-owner";

export type PendingOtp = {
  provider: OtpProviderCode;
  requestId: string;
  prefix: string;
  createdAt: number;
  attempts: number;
};

const PENDING_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_VERIFY_ATTEMPTS = 5;
// Text-message codes per number and per caller address. Checked and
// recorded in one locked statement (phone_otp_claim_send), before the
// provider is called, so simultaneous requests cannot all pass.
const SENDS_PER_NUMBER_PER_HOUR = 5;
const SENDS_PER_NUMBER_PER_DAY = 10;
const SENDS_PER_IP_PER_HOUR = 10;

export type OtpSendClaim =
  | { ok: true }
  | { ok: false; status: 429 | 500; message: string };

/**
 * Takes the right to send one code to this number (from this address, when
 * known). The resend cooldown covers every purpose: a sign-in code and a
 * phone-change code are both texts to the same phone.
 */
export async function claimOtpSend(
  phoneE164: string,
  ipAddress: string | null,
): Promise<OtpSendClaim> {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "phone_otp_claim_send",
    {
      p_phone_e164: phoneE164,
      p_ip_address: ipAddress,
      p_cooldown_seconds: RESEND_COOLDOWN_MS / 1000,
      p_per_number_hour: SENDS_PER_NUMBER_PER_HOUR,
      p_per_number_day: SENDS_PER_NUMBER_PER_DAY,
      p_per_ip_hour: SENDS_PER_IP_PER_HOUR,
    },
  );
  if (error || !data) {
    logger.error(`phone_otp_claim_send failed: ${error?.message}`);
    return {
      ok: false,
      status: 500,
      message: "Something went wrong. Please try again.",
    };
  }
  const claim = data as {
    ok: boolean;
    reason?: "cooldown" | "number_hour" | "number_day" | "ip_hour";
    retry_after_seconds?: number;
  };
  if (claim.ok) return { ok: true };
  if (claim.reason === "cooldown") {
    return {
      ok: false,
      status: 429,
      message: `Please wait ${claim.retry_after_seconds ?? 60}s before requesting another code.`,
    };
  }
  if (claim.reason === "ip_hour") {
    return {
      ok: false,
      status: 429,
      message: "Too many verification codes requested. Please try again later.",
    };
  }
  return {
    ok: false,
    status: 429,
    message:
      "Too many codes have been sent to this number. Please try again later, or sign in with Google or email.",
  };
}

export async function getResendCooldownRemainingMs(
  purpose: PhoneOtpPurpose,
  phoneE164: string,
): Promise<number> {
  const supabase = getSupabaseServiceClient();

  const { data } = await supabase
    .from("phone_otp_state")
    .select("last_sent_at")
    .eq("purpose", purpose)
    .eq("phone_e164", phoneE164)
    .maybeSingle();

  if (!data?.last_sent_at) return 0;

  const remaining =
    RESEND_COOLDOWN_MS - (Date.now() - new Date(data.last_sent_at).getTime());
  return remaining > 0 ? remaining : 0;
}

export async function recordOtpSent(
  purpose: PhoneOtpPurpose,
  phoneE164: string,
  requestId: string,
  prefix: string,
  provider: OtpProviderCode,
): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const now = new Date().toISOString();

  await supabase.from("phone_otp_state").upsert(
    {
      purpose,
      phone_e164: phoneE164,
      request_id: requestId,
      prefix,
      provider,
      attempts: 0,
      created_at: now,
      last_sent_at: now,
    },
    { onConflict: "purpose,phone_e164" },
  );
}

export async function getPendingOtp(
  purpose: PhoneOtpPurpose,
  phoneE164: string,
): Promise<PendingOtp | null> {
  const supabase = getSupabaseServiceClient();

  const { data } = await supabase
    .from("phone_otp_state")
    .select("request_id, prefix, provider, created_at, attempts")
    .eq("purpose", purpose)
    .eq("phone_e164", phoneE164)
    .maybeSingle();

  if (!data) return null;

  const createdAt = new Date(data.created_at).getTime();

  if (Date.now() - createdAt > PENDING_TTL_MS) {
    await clearPendingOtp(purpose, phoneE164);
    return null;
  }

  return {
    provider: data.provider as OtpProviderCode,
    requestId: data.request_id,
    prefix: data.prefix,
    createdAt,
    attempts: data.attempts,
  };
}

// Called before attempting a provider verify. Returns false once the attempt
// budget is exhausted, in which case the pending entry is cleared and the
// caller must request a fresh code.
export async function registerVerifyAttempt(
  purpose: PhoneOtpPurpose,
  phoneE164: string,
): Promise<boolean> {
  // One conditional UPDATE (phone_otp_take_attempt): simultaneous guesses
  // each take one of the remaining attempts or are refused, so a burst of
  // requests can never try more than MAX_VERIFY_ATTEMPTS codes.
  const { data, error } = await getSupabaseServiceClient().rpc(
    "phone_otp_take_attempt",
    {
      p_purpose: purpose,
      p_phone_e164: phoneE164,
      p_max_attempts: MAX_VERIFY_ATTEMPTS,
    },
  );
  if (error) {
    logger.error(`phone_otp_take_attempt failed: ${error.message}`);
    return false;
  }
  return data === true;
}

// Called once a code has been successfully verified, so it can never be
// replayed and a resend always starts a fresh attempt budget.
export async function clearPendingOtp(
  purpose: PhoneOtpPurpose,
  phoneE164: string,
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  await supabase
    .from("phone_otp_state")
    .delete()
    .eq("purpose", purpose)
    .eq("phone_e164", phoneE164);
}
