"use server";

import { createClient } from "@/config/supabase/server";
import {
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_COOKIE_NAME,
  type Locale,
  isLocale,
} from "@/i18n/config";
import { saveUserLocale } from "@abonten/services/i18n/userLocale";
import { cookies } from "next/headers";

export async function setUserLocale(locale: Locale) {
  if (!isLocale(locale)) {
    return { status: 400, message: "Unsupported locale" };
  }

  (await cookies()).set(LOCALE_COOKIE_NAME, locale, {
    path: "/",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: LOCALE_COOKIE_MAX_AGE,
  });

  // Signed in: remember it on the account too, so notifications and emails
  // arrive in the language the person reads the site in.
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) await saveUserLocale(data.user.id, locale);
  } catch {
    // The cookie is set; the account copy is best effort.
  }

  return { status: 200, message: "Locale updated" };
}
