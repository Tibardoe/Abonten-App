import { cookies } from "next/headers";
import {
  LOCALE_COOKIE_NAME,
  type Locale,
  defaultLocale,
  isLocale,
} from "./config";

export async function getUserLocale(): Promise<Locale> {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE_NAME)?.value;
  return isLocale(cookieLocale) ? cookieLocale : defaultLocale;
}
