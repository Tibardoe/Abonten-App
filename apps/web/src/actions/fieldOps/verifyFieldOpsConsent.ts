"use server";

import { verifyConsentByTokenCore } from "@abonten/services/fieldOps/member/ownerOtpCore";
import { checkRateLimit } from "@abonten/services/security/rateLimit";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import { fieldOpsConsentVerifySchema } from "@abonten/validation/fieldOpsSchemas";
import { headers } from "next/headers";

/**
 * The business owner enters the code on their own phone (online mode).
 * Token-authorised; the per-phone attempt cap lives in the OTP store, and a
 * coarse per-IP cap here keeps the public page from being hammered.
 */
export async function verifyFieldOpsConsent(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: { verified: boolean };
}> {
  const parsed = fieldOpsConsentVerifySchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  if (!(await checkRateLimit(`fieldops-consent:${ip}`, 30, 3600))) {
    return { status: 429, message: "Too many attempts. Try again later." };
  }
  return verifyConsentByTokenCore(getSupabaseServiceClient(), parsed.data);
}
