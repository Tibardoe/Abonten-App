import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";
import { type Locale, SERVER_TIME_ZONE, isLocale } from "./config";
import { getUserLocale } from "./locale";
import { loadMessages } from "./messages";

// Which language this request renders in.
//
// Every page lives under app/[locale] (the proxy rewrites "/events/x" to
// "/fr/events/x" from the visitor's cookie or Accept-Language), so in a
// Server Component the locale is the root route parameter — readable at
// build time too, which is what keeps the static pages static. Server
// Actions and route handlers have no root params; there the cookie the
// proxy maintains is the answer.
export default getRequestConfig(async () => {
  let fromRoute: string | undefined;
  try {
    fromRoute = await rootLocale();
  } catch {
    fromRoute = undefined;
  }
  const locale: Locale = isLocale(fromRoute)
    ? fromRoute
    : await getUserLocale();

  return {
    locale,
    messages: await loadMessages(locale),
    timeZone: SERVER_TIME_ZONE,
  };
});
