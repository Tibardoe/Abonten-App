import ensureProfileCompletionNotification from "@/actions/ensureProfileCompletionNotification";
import { createAnonClient } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  localeOfRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { saveUserLocale } from "@abonten/services/i18n/userLocale";
import {
  signInVerifiedPhoneUser,
  verifyPhoneOtpAndResolveUser,
} from "@abonten/services/profile/phoneAuthCore";

// POST /api/mobile/auth/phone/verify  { "phoneE164": "+233...", "code": "123456" }
//
// Mobile equivalent of the verifyPhoneSignIn Server Action. Runs the exact
// same core (Hubtel verify -> find-or-create user -> sign-in password), then
// — instead of writing SSR cookies — signs in on a session-less supabase-js
// client and returns the resulting Supabase session tokens in the body for
// expo-secure-store. Same session-minting technique, same security
// properties; only the transport differs.
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
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
        message: tr("phonee164AndCodeAreRequired"),
      });
    }

    const resolved = await verifyPhoneOtpAndResolveUser(phoneE164, code);

    if (!resolved.ok) {
      return apiJson({ status: resolved.status, message: resolved.message });
    }

    const supabase = createAnonClient();
    const signedIn = await signInVerifiedPhoneUser(
      resolved.userId,
      (password) =>
        supabase.auth.signInWithPassword({ phone: phoneE164, password }),
    );
    const data = signedIn.ok ? signedIn.result.data : null;

    if (!data?.session) {
      logger.error(
        `mobile phone verify: sign-in failed: ${signedIn.ok ? "no session" : signedIn.message}`,
      );
      return apiJson({
        status: 500,
        message: tr("somethingWentWrongSigningYouIn"),
      });
    }

    // The language the app was showing, before anything is written for
    // them (the app keeps it in sync afterwards: useLocaleSync).
    await saveUserLocale(resolved.userId, localeOfRequest(req), {
      onlyIfUnset: true,
    });

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
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
    });
  }
}
