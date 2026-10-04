import type { Metadata } from "next";
import { defaultLocale } from "./config";
import { LOCALE_QUERY_PARAM } from "./routing";

// Addresses carry no language: a page is shown in the visitor's (cookie,
// then browser). A search engine needs an address per language, so each
// language's version is the same address with ?hl=<locale>, which the proxy
// reads (i18n/routing.ts). English is the plain address and the default.
// Twi is partly translated and not offered to search engines; a Twi page
// points to the English one.

/** The languages offered to search engines. */
export const INDEXED_LOCALES = ["en", "fr", "es", "de", "pt"] as const;

function isIndexed(locale: string): boolean {
  return (INDEXED_LOCALES as readonly string[]).includes(locale);
}

/** `path` (or an absolute URL) as the page in `locale`. */
export function localizedUrl(path: string, locale: string): string {
  if (locale === defaultLocale || !isIndexed(locale)) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${LOCALE_QUERY_PARAM}=${locale}`;
}

/** The address of every language version, for a sitemap entry. */
export function languageUrls(path: string): Record<string, string> {
  return {
    ...Object.fromEntries(
      INDEXED_LOCALES.map((l) => [l, localizedUrl(path, l)]),
    ),
    "x-default": path,
  };
}

/**
 * A page's canonical address in the language it was rendered in, and its
 * other languages (hreflang). For pages whose words are translated; the
 * legal pages, English until counsel approves, keep a plain canonical.
 */
export function languageAlternates(
  path: string,
  locale: string,
): NonNullable<Metadata["alternates"]> {
  return {
    canonical: localizedUrl(path, locale),
    languages: languageUrls(path),
  };
}
