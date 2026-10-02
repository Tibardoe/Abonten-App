import { locales } from "@/i18n/config";
import { revalidatePath } from "next/cache";

// Every page is rendered once per language under app/[locale] (see
// i18n/routing.ts), and Next's cache is keyed by that internal route, not
// the public address. Revalidating "/events/abc" alone would miss every
// cached translation of it, so this is the only way pages are revalidated
// in the web app — scripts/check-locale-routing.mjs refuses a direct
// revalidatePath() anywhere else.
export function revalidateAppPath(path: string, type?: "page" | "layout") {
  for (const locale of locales) {
    const localized = path === "/" ? `/${locale}` : `/${locale}${path}`;
    if (type) revalidatePath(localized, type);
    else revalidatePath(localized);
  }
}
