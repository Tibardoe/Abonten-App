"use server";

import { getSupabaseServiceClient } from "@/config/supabase/serviceClient";
import {
  type PhoneOtpSendResult,
  sendPhoneOtpCore,
} from "@abonten/services/profile/phoneOtpSendCore";
import type { PhoneOtpPurpose } from "@abonten/services/profile/phoneOtpStore";
import { headers } from "next/headers";

const MAX_SENDS_PER_IP_PER_HOUR = 10;

// Best-effort caller IP from standard proxy headers -- Vercel/most hosts set
// x-forwarded-for. Never trust this for anything beyond a coarse abuse
// signal (it's client-influenceable), only as an additional layer on top of
// the authoritative per-phone-number cooldown/attempt-cap in the core.
async function getCallerIp(): Promise<string | null> {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || null;
}

export type RequestPhoneVerificationResult = PhoneOtpSendResult;

// Shared by phone sign-in (AuthModal), Settings -> Security's add/change-
// phone flow and the mobile route. The market of the number's country
// decides which provider sends the code (Hubtel in Ghana, Twilio Verify
// elsewhere); the provider's request handle is kept server-side and never
// sent to the client. `codeLength` tells the client how many digits to ask
// for.
export default async function requestPhoneVerification(
  dialCode: string,
  rawPhone: string,
  purpose: PhoneOtpPurpose,
): Promise<RequestPhoneVerificationResult> {
  const ipAddress = await getCallerIp();

  const result = await sendPhoneOtpCore({
    dialCode,
    rawPhone,
    purpose,
    beforeSend: async () => {
      if (ipAddress && (await isIpOverSendCap(ipAddress))) {
        return {
          status: 429,
          message:
            "Too many verification codes requested. Please try again later.",
        };
      }
      return null;
    },
  });

  if (result.status === 200) {
    await logOtpSend(result.phoneE164, ipAddress);
  }
  return result;
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
