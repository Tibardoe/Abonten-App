// Synchronous translators for server code: the services package, route
// handlers, emails, push notifications and the admin console. The browser
// and the phone use next-intl / use-intl providers over the same catalogs;
// this is the same library core (use-intl/core) without React.
//
// Every translator falls back to English key by key, so a message the
// translators have not reached yet still reads as English, never as a key.

import { createTranslator } from "use-intl/core";
import { I18N_LOCALES, type I18nLocale } from "./namespaces";
import {
  SERVER_CATALOG,
  type ServerNamespace,
} from "./serverCatalog.generated";

export { I18N_LOCALES, type I18nLocale } from "./namespaces";
export type { ServerNamespace } from "./serverCatalog.generated";

export const DEFAULT_LOCALE: I18nLocale = "en";

export type TranslationValues = Record<
  string,
  string | number | Date | null | undefined
>;

/** A translator bound to one language and one namespace. */
export type ServerTranslator = (
  key: string,
  values?: TranslationValues,
) => string;

/** "fr-CA", "FR", "fr_FR" → "fr"; anything without a catalog → English. */
export function toLocale(input: string | null | undefined): I18nLocale {
  const lang = (input ?? "").trim().toLowerCase().split(/[-_]/)[0];
  return (I18N_LOCALES as readonly string[]).includes(lang)
    ? (lang as I18nLocale)
    : DEFAULT_LOCALE;
}

/**
 * The best supported language of an Accept-Language header, honouring its
 * quality values ("de;q=0.4, fr;q=0.9" → "fr").
 */
export function localeFromAcceptLanguage(
  header: string | null | undefined,
): I18nLocale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="))
        ?.slice(2);
      const quality = q === undefined ? 1 : Number(q);
      return {
        tag: tag.trim().toLowerCase(),
        quality: Number.isFinite(quality) ? quality : 0,
        index,
      };
    })
    .filter((entry) => entry.tag && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  for (const { tag } of ranked) {
    const lang = tag.split("-")[0];
    if ((I18N_LOCALES as readonly string[]).includes(lang)) {
      return lang as I18nLocale;
    }
  }
  return DEFAULT_LOCALE;
}

type Messages = Record<string, unknown>;

function mergeMessages(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const current = out[key];
    if (
      value &&
      typeof value === "object" &&
      current &&
      typeof current === "object"
    ) {
      out[key] = mergeMessages(current as Messages, value as Messages);
    } else {
      out[key] = value;
    }
  }
  return out;
}

// Akan has no ICU data of its own; its numbers and dates follow the
// product's British English conventions.
function intlTag(locale: I18nLocale): string {
  return locale === "ak" || locale === "en" ? "en-GB" : locale;
}

const translators = new Map<string, ServerTranslator>();

/**
 * A translator for `namespace` in `locale`. Cached: asking again is free.
 * Values that are null or undefined are rendered as an empty string, so a
 * missing name can never throw in the middle of a request.
 */
export function serverTranslator(
  locale: string | null | undefined,
  namespace: ServerNamespace,
): ServerTranslator {
  const lang = toLocale(locale);
  const cacheKey = `${lang}|${namespace}`;
  const cached = translators.get(cacheKey);
  if (cached) return cached;

  const english = SERVER_CATALOG[DEFAULT_LOCALE][namespace] as Messages;
  const messages =
    lang === DEFAULT_LOCALE
      ? english
      : mergeMessages(english, SERVER_CATALOG[lang][namespace] as Messages);

  const translate = createTranslator({
    locale: intlTag(lang),
    messages: { [namespace]: messages },
    namespace,
    // A missing or malformed message must never take a request down: fall
    // back to the key path, which is also what the tests look for.
    onError: () => {},
    getMessageFallback: ({ key }) => key,
  }) as unknown as (key: string, values?: Record<string, unknown>) => string;

  const translator: ServerTranslator = (key, values) => {
    if (!values) return translate(key);
    const safe: Record<string, string | number | Date> = {};
    for (const [name, value] of Object.entries(values)) {
      safe[name] = value ?? "";
    }
    return translate(key, safe);
  };
  translators.set(cacheKey, translator);
  return translator;
}

/** The translator @abonten/core's copy helpers take (namespace `core`). */
export function coreTranslator(locale?: string | null): ServerTranslator {
  return serverTranslator(locale, "core");
}
