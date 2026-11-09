import { logger } from "@abonten/core/logger";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { tr } from "../i18n/requestLocale";

// "Sign out of other devices" (Settings › Security, website and app). Signing
// out is per device (PROJECT.md §73), so this is how a person ends the
// sessions on a phone they lost, sold or lent. Called from the web Server
// Action and POST /api/mobile/devices/sign-out-others, which have verified
// `userId` and pass the caller's own access token.

export type SignOutOtherDevicesResult = {
  status: 200 | 401 | 500;
  message?: string;
};

const text = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.length > 0 && value.length <= max
    ? value
    : null;

export async function signOutOtherDevicesCore(
  userId: string,
  accessToken: string,
  input: {
    /** This phone's Expo push token: it keeps its notifications. */
    keepDeviceToken?: unknown;
    /** This browser's push endpoint: it keeps its notifications. */
    keepWebPushEndpoint?: unknown;
  },
  service: ServiceRoleClient = getSupabaseServiceClient(),
): Promise<SignOutOtherDevicesResult> {
  if (!userId || !accessToken) {
    return { status: 401, message: tr("invalidOrExpiredSession") };
  }

  // The auth server ends every session of the token's account except the
  // token's own. It runs as the person (their token), not as the service.
  const { error } = await service.auth.admin.signOut(accessToken, "others");
  if (error) {
    // The token's own session has already ended (signed out, revoked):
    // supabase-js reports that as AuthSessionMissingError (status 400).
    if (
      isAuthSessionMissingError(error) ||
      error.status === 401 ||
      error.status === 403 ||
      error.status === 404
    ) {
      return { status: 401, message: tr("invalidOrExpiredSession") };
    }
    logger.error(`signOutOtherDevices: auth sign-out failed: ${error.message}`);
    return { status: 500, message: tr("somethingWentWrong") };
  }

  // A device signed out this way never ran its own sign-out, so it would
  // keep getting this person's notifications (messages, tickets) on its lock
  // screen. Their push registrations go too; the device asking keeps its own.
  const keepDeviceToken = text(input.keepDeviceToken, 512);
  const keepWebPushEndpoint = text(input.keepWebPushEndpoint, 1024);

  let phones = service.from("device_token").delete().eq("user_id", userId);
  if (keepDeviceToken) phones = phones.neq("token", keepDeviceToken);
  let browsers = service
    .from("web_push_subscription")
    .delete()
    .eq("user_id", userId);
  if (keepWebPushEndpoint) {
    browsers = browsers.neq("endpoint", keepWebPushEndpoint);
  }

  const [phonesResult, browsersResult] = await Promise.all([phones, browsers]);
  const pushError = phonesResult.error ?? browsersResult.error;
  if (pushError) {
    // The sessions are already gone; trying again is safe and finishes this.
    logger.error(
      `signOutOtherDevices: push clean-up failed: ${pushError.message}`,
    );
    return { status: 500, message: tr("somethingWentWrong") };
  }

  return { status: 200 };
}
