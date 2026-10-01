"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { getLocalePreferencesCore } from "@abonten/services/markets/localePreferencesCore";

/** The signed-in person's home market, estimate currency and distance unit. */
export default withActionLocale(async function getLocalePreferences() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: tr("userNotLoggedIn") };
  return getLocalePreferencesCore(user.id);
});
