"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { resendConsentCodeCore } from "@abonten/services/fieldOps/member/ownerOtpCore";
import { tr } from "@abonten/services/i18n/requestLocale";
import { checkRateLimit } from "@abonten/services/security/rateLimit";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import { fieldOpsConsentResendSchema } from "@abonten/validation/fieldOpsSchemas";
import { headers } from "next/headers";

/**
 * The business owner asks the consent page for a fresh code (theirs ran
 * out or never came). Token-authorised; the per-onboarding and per-number
 * caps live in the service, a coarse per-IP cap here.
 */
export const resendFieldOpsConsentCode = withActionLocale(
  async function resendFieldOpsConsentCode(input: unknown): Promise<{
    status: number;
    message?: string;
    data?: { resendInSeconds: number };
  }> {
    const parsed = fieldOpsConsentResendSchema.safeParse(input);
    if (!parsed.success) {
      return {
        status: 400,
        message: parsed.error.issues[0]?.message ?? tr("invalidInput"),
      };
    }
    const ip =
      (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    if (!(await checkRateLimit(`fieldops-consent-resend-ip:${ip}`, 10, 3600))) {
      return {
        status: 429,
        message: tr("tooManyAttemptsTryAgainLater"),
      };
    }
    return resendConsentCodeCore(getSupabaseServiceClient(), parsed.data);
  },
);
