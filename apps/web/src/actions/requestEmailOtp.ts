"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import {
  type RequestEmailOtpResult,
  requestEmailOtpCore,
} from "@abonten/services/profile/emailAuthCore";
import { headers } from "next/headers";

export type { RequestEmailOtpResult };

// Sends a 6-digit email sign-in code. Unauthenticated by design (pre-login),
// same as requestPhoneVerification. Uses the cookie-free anon client for the
// send — no session is involved. All validation + the per-email/per-IP send
// cap live in requestEmailOtpCore so the mobile
// POST /api/mobile/auth/email/request route runs the identical logic.
//
// Thin wrapper: resolve caller IP -> delegate.
export default async function requestEmailOtp(
  email: string,
): Promise<RequestEmailOtpResult> {
  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip")?.trim() ||
    null;

  return requestEmailOtpCore(publicSupabase, { email, ip });
}
