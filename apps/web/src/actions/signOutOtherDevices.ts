"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type SignOutOtherDevicesResult,
  signOutOtherDevicesCore,
} from "@abonten/services/profile/signOutOtherDevicesCore";

/**
 * Settings › Security: ends every session of the signed-in person except
 * this browser's, and stops notifications to the devices it ended.
 */
export default withActionLocale(async function signOutOtherDevices(input: {
  keepWebPushEndpoint?: string | null;
}): Promise<SignOutOtherDevicesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: tr("pleaseSignInFirst") };

  // The token getUser() has just verified; the auth server checks it again.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { status: 401, message: tr("pleaseSignInFirst") };
  }

  return signOutOtherDevicesCore(user.id, session.access_token, {
    keepWebPushEndpoint: input?.keepWebPushEndpoint,
  });
});
