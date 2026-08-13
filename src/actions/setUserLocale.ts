"use server";

import {
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_COOKIE_NAME,
  type Locale,
  isLocale,
} from "@/i18n/config";
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

  return { status: 200, message: "Locale updated" };
}
