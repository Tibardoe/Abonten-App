// The languages Abonten can be read in, for both language pickers.
//
// The data is locales.json so the catalog checks (plain Node scripts) read
// the same list the apps do.

import registry from "./locales.json";
import type { I18nLocale } from "./namespaces";

/**
 * How each language names itself: a person who cannot read the current
 * language must still find their own in the list.
 */
export const LOCALE_NAMES: Record<I18nLocale, string> = registry.names;

/** The order the pickers list them in. */
export const LOCALE_ORDER = registry.order as readonly I18nLocale[];

/**
 * Languages whose catalogs are not finished: most screens still fall back
 * to English. They stay in the picker, with a note saying so, because part
 * of the app in your own language is better than none of it — but nobody
 * should choose one expecting a fully translated app. Every other language
 * is held by `npm run check:i18n` to "nothing left in English".
 */
export const PARTIAL_LOCALES = registry.partial as readonly I18nLocale[];

export function isPartialLocale(locale: string): boolean {
  return (PARTIAL_LOCALES as readonly string[]).includes(locale);
}
