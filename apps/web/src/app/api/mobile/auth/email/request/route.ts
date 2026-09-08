import { apiJson } from "@/app/api/mobile/_lib/response";
import { publicSupabase } from "@/config/supabase/publicClient";
import { logger } from "@abonten/core/logger";
import { requestEmailOtpCore } from "@abonten/services/profile/emailAuthCore";

// POST /api/mobile/auth/email/request  { "email": "ben@example.com" }
//
// Unauthenticated by design (pre-login), mirroring /api/mobile/auth/phone/
// request. Runs the identical requestEmailOtpCore the web requestEmailOtp
// Server Action uses — per-email + per-IP send cap on top of Supabase's own
// rate limits, enumeration-safe result.
//
// There is deliberately NO matching /verify route: verifying an email code
// needs no server secret, so the native app calls
// supabase.auth.verifyOtp({ type: "email" }) directly, which persists the
// resulting session straight to expo-secure-store — the same asymmetry as
// mobile Google sign-in.
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      email?: unknown;
    } | null;

    if (typeof body?.email !== "string") {
      return apiJson({ status: 400, message: "email is required" });
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip")?.trim() ||
      null;

    const result = await requestEmailOtpCore(publicSupabase, {
      email: body.email,
      ip,
    });

    if (result.status === 200) {
      return apiJson({ status: 200, data: { sent: true } });
    }

    return apiJson({ status: result.status, message: result.message });
  } catch (error) {
    logger.error("mobile POST /auth/email/request failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
