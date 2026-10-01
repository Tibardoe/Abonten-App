"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { logger } from "@abonten/core/logger";
import { tr } from "@abonten/services/i18n/requestLocale";
import { deleteAccountCore } from "@abonten/services/profile/deleteAccountCore";

/**
 * Thin web transport over `deleteAccountCore` — resolves the cookie session
 * (proving who's calling), then delegates the service-role
 * `auth.admin.deleteUser` to the shared service so the mobile
 * `POST /api/mobile/account/delete` route runs it verbatim.
 */
export default withActionLocale(async function deleteUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    logger.error(`Error fetching user: ${userError?.message}`);
    return { status: 401, message: tr("userNotLoggedIn2") };
  }

  return deleteAccountCore(user.id);
});
