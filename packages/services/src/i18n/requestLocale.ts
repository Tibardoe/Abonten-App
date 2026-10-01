// Which language the person making the current request reads, and the
// translators that speak it.
//
// A service keeps its `(supabase, userId, input)` shape: it never takes a
// locale. The transport binds the language once at its entry point —
//   web Server Actions      bindRequestLocale(await getLocale())
//   /api/mobile handlers    bindLocaleFromRequest(req)  (Accept-Language)
// — and everything the request then runs (the service, the helpers it calls,
// the callbacks it awaits) reads it back through AsyncLocalStorage. Nothing
// bound means nobody is waiting for words (a cron job, a webhook, a test):
// English.
//
// A message for someone ELSE (a notification, an email, a push) must not use
// the requester's language: resolve the recipient's with userLocale() and
// use trFor() / coreTFor().

import { AsyncLocalStorage } from "node:async_hooks";
import {
  DEFAULT_LOCALE,
  type I18nLocale,
  type ServerTranslator,
  type TranslationValues,
  coreTranslator,
  localeFromAcceptLanguage,
  serverTranslator,
  toLocale,
  translateServerText,
} from "@abonten/i18n/server";

const store = new AsyncLocalStorage<I18nLocale>();

/**
 * Binds the language for the rest of this request. Call it synchronously in
 * the entry point itself (not inside a helper that is awaited): the binding
 * follows the async context of the function that makes it.
 */
export function bindRequestLocale(locale: string | null | undefined): void {
  store.enterWith(toLocale(locale));
}

/** Runs `fn` with `locale` bound, restoring the previous binding after. */
export function runWithLocale<T>(
  locale: string | null | undefined,
  fn: () => T,
): T {
  return store.run(toLocale(locale), fn);
}

/** The language bound to this request, English when none is. */
export function requestLocale(): I18nLocale {
  return store.getStore() ?? DEFAULT_LOCALE;
}

/**
 * The language a request asks for: an explicit `x-abonten-locale` (what the
 * app's Language setting says) wins over the device's Accept-Language.
 */
export function localeOfRequest(req: {
  headers: { get(name: string): string | null };
}): I18nLocale {
  const explicit = req.headers.get("x-abonten-locale");
  if (explicit) return toLocale(explicit);
  return localeFromAcceptLanguage(req.headers.get("accept-language"));
}

/** Route handlers: bind the language the request asks for. */
export function bindLocaleFromRequest(req: {
  headers: { get(name: string): string | null };
}): void {
  store.enterWith(localeOfRequest(req));
}

/** A service message (`server` namespace) in the requester's language. */
export function tr(key: string, values?: TranslationValues): string {
  return serverTranslator(requestLocale(), "server")(key, values);
}

/** The `server` namespace in a named language (a recipient's). */
export function trFor(locale: string | null | undefined): ServerTranslator {
  return serverTranslator(locale, "server");
}

/** The translator @abonten/core's copy helpers take, requester's language. */
export function coreT(): ServerTranslator {
  return coreTranslator(requestLocale());
}

/** The same for a named language (a recipient's). */
export function coreTFor(locale: string | null | undefined): ServerTranslator {
  return coreTranslator(locale);
}

/** Email wording (`emails` namespace) in a named language. */
export function emailT(locale: string | null | undefined): ServerTranslator {
  return serverTranslator(locale, "emails");
}

/**
 * The last step before an answer leaves the server: a `message` the
 * database wrote (or any English the services could not word themselves)
 * is swapped for its translation in the requester's language. Everything
 * else in the envelope is untouched.
 */
export function localizeEnvelope<T>(result: T): T {
  if (!result || typeof result !== "object") return result;
  const locale = requestLocale();
  if (locale === DEFAULT_LOCALE) return result;
  const message = (result as { message?: unknown }).message;
  if (typeof message !== "string" || !message) return result;
  const translated = translateServerText(locale, message);
  if (translated === message) return result;
  return { ...result, message: translated };
}
