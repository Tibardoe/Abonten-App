import ensureProfileCompletionNotification from "@/actions/ensureProfileCompletionNotification";
import { createAnonClient } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import {
  issueOneTimePassword,
  verifyPhoneOtpAndResolveUser,
} from "@/services/phoneAuthCore";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/auth/phone/verify  { "phoneE164": "+233...", "code": "123456" }
//
// Mobile equivalent of the verifyPhoneSignIn Server Action. Runs the exact
// same core (Hubtel verify -> find-or-create user -> one-time password), then
// — instead of writing SSR cookies — consumes the one-time password on a
// session-less supabase-js client and returns the resulting Supabase session
// tokens in the body for expo-secure-store. Same session-minting technique,
// same security properties; only the transport differs.
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      phoneE164?: unknown;
      code?: unknown;
    } | null;

    const phoneE164 = body?.phoneE164;
    const code = body?.code;

    if (typeof phoneE164 !== "string" || typeof code !== "string") {
      return apiJson({
        status: 400,
        message: "phoneE164 and code are required",
      });
    }

    const resolved = await verifyPhoneOtpAndResolveUser(phoneE164, code);

    if (!resolved.ok) {
      return apiJson({ status: resolved.status, message: resolved.message });
    }

    const password = await issueOneTimePassword(resolved.userId);

    if (!password.ok) {
      logger.error(
        `mobile phone verify: one-time password failed: ${password.message}`,
      );
      return apiJson({
        status: 500,
        message: "Something went wrong signing you in.",
      });
    }

    const supabase = createAnonClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      phone: phoneE164,
      password: password.secret,
    });

    if (error || !data.session) {
      logger.error(`mobile phone verify: sign-in failed: ${error?.message}`);
      return apiJson({
        status: 500,
        message: "Something went wrong signing you in.",
      });
    }

    if (resolved.isNewUser) {
      await ensureProfileCompletionNotification(resolved.userId);
    }

    return apiJson({
      status: 200,
      data: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
        token_type: data.session.token_type,
        user: {
          id: data.user?.id,
          phone: data.user?.phone,
        },
        isNewUser: resolved.isNewUser,
      },
    });
  } catch (error) {
    logger.error("mobile POST /auth/phone/verify failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
