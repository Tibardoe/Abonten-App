// The language a person has chosen (user_info.locale), for words written
// FOR them by someone else's request or by a job: notifications, pushes,
// emails. The web language switch and the app's Language setting both save
// it (updateLocalePreferencesCore). Nobody chosen yet, an account that no
// longer exists, or a failed lookup all mean English — a notice in English
// is better than no notice.

import { logger } from "@abonten/core/logger";
import {
  DEFAULT_LOCALE,
  type I18nLocale,
  toLocale,
} from "@abonten/i18n/server";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

export async function userLocale(
  userId: string | null | undefined,
): Promise<I18nLocale> {
  if (!userId) return DEFAULT_LOCALE;
  try {
    const { data, error } = await getSupabaseServiceClient()
      .from("user_info")
      .select("locale")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      logger.warn(`userLocale(${userId}): ${error.message}`);
      return DEFAULT_LOCALE;
    }
    return toLocale(data?.locale);
  } catch (error) {
    logger.warn(
      `userLocale(${userId}): ${error instanceof Error ? error.message : String(error)}`,
    );
    return DEFAULT_LOCALE;
  }
}

/** The same for several people in one query. Missing ids read as English. */
export async function userLocales(
  userIds: readonly string[],
): Promise<Map<string, I18nLocale>> {
  const out = new Map<string, I18nLocale>();
  const ids = [...new Set(userIds.filter(Boolean))];
  for (const id of ids) out.set(id, DEFAULT_LOCALE);
  if (ids.length === 0) return out;
  try {
    const { data, error } = await getSupabaseServiceClient()
      .from("user_info")
      .select("id, locale")
      .in("id", ids);
    if (error) {
      logger.warn(`userLocales: ${error.message}`);
      return out;
    }
    for (const row of data ?? []) out.set(row.id, toLocale(row.locale));
  } catch (error) {
    logger.warn(
      `userLocales: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return out;
}

/**
 * Saves the language a person reads in to their account. `onlyIfUnset`
 * is for sign-in: it records the language they signed in with the first
 * time and never overrides a choice made later in Settings. Best effort:
 * never throws and never fails the request that calls it.
 */
export async function saveUserLocale(
  userId: string | null | undefined,
  locale: string | null | undefined,
  options: { onlyIfUnset?: boolean } = {},
): Promise<void> {
  if (!userId || !locale) return;
  const value = toLocale(locale);
  try {
    let query = getSupabaseServiceClient()
      .from("user_info")
      .update({ locale: value })
      .eq("id", userId);
    if (options.onlyIfUnset) query = query.is("locale", null);
    const { error } = await query;
    if (error) logger.warn(`saveUserLocale(${userId}): ${error.message}`);
  } catch (error) {
    logger.warn(
      `saveUserLocale(${userId}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
