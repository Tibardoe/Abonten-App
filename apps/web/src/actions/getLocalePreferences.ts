"use server";

import { createClient } from "@/config/supabase/server";
import { getLocalePreferencesCore } from "@abonten/services/markets/localePreferencesCore";

/** The signed-in person's home market, estimate currency and distance unit. */
export default async function getLocalePreferences() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: "User not logged in" };
  return getLocalePreferencesCore(user.id);
}
