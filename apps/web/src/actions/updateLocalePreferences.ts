"use server";

import { createClient } from "@/config/supabase/server";
import { updateLocalePreferencesCore } from "@abonten/services/markets/localePreferencesCore";
import type { LocalePreferencesPatch } from "@abonten/types/marketType";

/**
 * Saves the person's home market, estimate currency and distance unit.
 * The home market must be an open market; it is written server-side
 * because clients may not write it directly.
 */
export default async function updateLocalePreferences(
  patch: LocalePreferencesPatch,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: "User not logged in" };
  return updateLocalePreferencesCore(user.id, patch);
}
