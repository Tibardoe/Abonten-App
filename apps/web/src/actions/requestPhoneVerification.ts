"use server";

import { getSupabaseServiceClient } from "@/config/supabase/serviceClient";
import { normalizePhoneNumber } from "@abonten/core/normalizePhoneNumber";
import { sendHubtelOtp } from "@abonten/services/profile/hubtelOtpClient";
import {
  type PhoneOtpPurpose,
  getResendCooldownRemainingMs,
  recordOtpSent,
} from "@abonten/services/profile/phoneOtpStore";
import { headers } from "next/headers";

const MAX_SENDS_PER_IP_PER_HOUR = 10;

// Best-effort caller IP from standard proxy headers -- Vercel/most hosts set
// x-forwarded-for. Never trust this for anything beyond a coarse abuse
// signal (it's client-influenceable), only as an additional layer on top of
// the authoritative per-phone-number cooldown/attempt-cap above.
async function getCallerIp(): Promise<string | null> {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || null;
}

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

  const cooldownRemainingMs = await getResendCooldownRemainingMs(
    purpose,
    normalized.e164,
  );

  if (cooldownRemainingMs > 0) {
    return {
      status: 429,
      message: `Please wait ${Math.ceil(cooldownRemainingMs / 1000)}s before requesting another code.`,
    };
  }

  const ipAddress = await getCallerIp();

  if (ipAddress && (await isIpOverSendCap(ipAddress))) {
    return {
      status: 429,
      message: "Too many verification codes requested. Please try again later.",
    };
  }

  const result = await sendHubtelOtp(normalized.e164);

  if (!result.ok) {
    return { status: 500, message: result.message };
  }

  await recordOtpSent(
    purpose,
    normalized.e164,
    result.requestId,
    result.prefix,
  );
  await logOtpSend(normalized.e164, ipAddress);

  return { status: 200, phoneE164: normalized.e164 };
}

async function isIpOverSendCap(ipAddress: string): Promise<boolean> {
  const supabase = getSupabaseServiceClient();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from("phone_otp_send_log")
    .select("id", { count: "exact", head: true })
    .eq("ip_address", ipAddress)
    .gte("created_at", oneHourAgo);

  return (count ?? 0) >= MAX_SENDS_PER_IP_PER_HOUR;
}

async function logOtpSend(
  phoneE164: string,
  ipAddress: string | null,
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  await supabase
    .from("phone_otp_send_log")
    .insert({ phone_e164: phoneE164, ip_address: ipAddress });
}
