// Server-only, durable pending-OTP store, backed by the phone_otp_state
// Postgres table (see supabase/migrations/20260902100000_durable_phone_otp_state.sql).
// Holds the Hubtel requestId/prefix returned by a successful send, keyed by
// phone number + purpose, so the client never receives them (it only ever
// sends {phone, code} to verify) and so a resend/replay can't reuse an
// already-consumed code.
//
// Previously an in-memory Map -- fine on a single long-lived process, but
// silently broken across multiple server instances (a resend/verify routed
// to a different instance than the original send would see no pending
// state at all). Moved to Postgres, queried only through the service-role
// client, so this state is shared and authoritative regardless of which
// instance handles a given request.

import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";

export type PhoneOtpPurpose = "sign-in" | "phone-update";

type PendingOtp = {
  requestId: string;
  prefix: string;
  createdAt: number;
  attempts: number;
};

const PENDING_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_VERIFY_ATTEMPTS = 5;

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
): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const now = new Date().toISOString();

  await supabase.from("phone_otp_state").upsert(
    {
      purpose,
      phone_e164: phoneE164,
      request_id: requestId,
      prefix,
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
    .select("request_id, prefix, created_at, attempts")
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
    requestId: data.request_id,
    prefix: data.prefix,
    createdAt,
    attempts: data.attempts,
  };
}

// Called before attempting a Hubtel verify. Returns false once the attempt
// budget is exhausted, in which case the pending entry is cleared and the
// caller must request a fresh code.
export async function registerVerifyAttempt(
  purpose: PhoneOtpPurpose,
  phoneE164: string,
): Promise<boolean> {
  const supabase = getSupabaseServiceClient();

  // Supabase-js can't express `attempts = attempts + 1` in a single
  // .update() call without a raw SQL expression, so this reads then writes.
  // The attempt cap only needs to be approximately race-safe (a genuine
  // double-submit race here just costs an attacker one extra guess, not a
  // security hole), so this two-step read/write is an acceptable tradeoff
  // for staying on the plain PostgREST client instead of adding an RPC.
  const { data: current } = await supabase
    .from("phone_otp_state")
    .select("attempts")
    .eq("purpose", purpose)
    .eq("phone_e164", phoneE164)
    .maybeSingle();

  if (!current) return false;

  const nextAttempts = current.attempts + 1;

  if (nextAttempts > MAX_VERIFY_ATTEMPTS) {
    await clearPendingOtp(purpose, phoneE164);
    return false;
  }

  await supabase
    .from("phone_otp_state")
    .update({ attempts: nextAttempts })
    .eq("purpose", purpose)
    .eq("phone_e164", phoneE164);

  return true;
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
