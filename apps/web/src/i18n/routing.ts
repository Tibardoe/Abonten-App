import { LOCALE_COOKIE_NAME, type Locale, isLocale } from "./config";
import { getPreferredLocale } from "./negotiateLocale";

// Locale routing without a locale in the address.
//
// Public URLs never carry a language ("/events/abc", not "/fr/events/abc"):
// one address per page for sharing and search engines. Internally every
// page is under app/[locale], so the proxy rewrites each page request to
// "/<locale>/<path>". The locale comes from a link that names one
// ("?hl=fr"), else the preference cookie, else the browser's
// Accept-Language, else English.

// Requests that are not pages and must reach their own route untouched.
const PASSTHROUGH_PREFIXES = [
  "/api/",
  "/go/",
  "/_next/",
  "/_vercel/",
  "/.well-known/",
  "/monitoring",
];

// Static files served from /public. A page address never ends like this —
// usernames may contain a period, so "has a dot" alone is not the test.
const STATIC_FILE =
  /\.(?:ico|png|jpe?g|gif|webp|avif|svg|js|mjs|css|map|txt|xml|json|woff2?|ttf|otf|mp4|webm|pdf|webmanifest)$/i;

export function isLocalizedPath(pathname: string): boolean {
  if (pathname === "/api") return false;
  if (PASSTHROUGH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return false;
  }
  return !STATIC_FILE.test(pathname);
}

/**
 * The query parameter a link uses to name its language. The app opens help
 * and the policies with it, so they match the app's language rather than
 * the phone's (the in-app browser sends the phone's Accept-Language and
 * keeps its own cookies).
 */
export const LOCALE_QUERY_PARAM = "hl";

export function resolveRequestLocale(request: {
  cookies: { get(name: string): { value: string } | undefined };
  headers: { get(name: string): string | null };
  nextUrl?: { searchParams: URLSearchParams };
}): Locale {
  const fromLink = request.nextUrl?.searchParams.get(LOCALE_QUERY_PARAM);
  if (isLocale(fromLink)) return fromLink;
  const fromCookie = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  return getPreferredLocale(request.headers.get("accept-language"));
}

/** "/events/abc" → "/fr/events/abc". */
export function localizedPathname(pathname: string, locale: Locale): string {
  return pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
}
