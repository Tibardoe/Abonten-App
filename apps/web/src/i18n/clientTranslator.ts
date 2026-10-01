// A translator for browser code that is not a component or a hook: a click
// handler in a plain module (share, upload, attach a file) that has to word
// a toast or an error. Components and hooks use useTranslations(); this is
// only for the helpers they call.
//
// LocaleProvider hands over the language and catalogs the page was rendered
// with (the same ones NextIntlClientProvider holds), so a helper says
// exactly what the screen around it says. It is BROWSER-ONLY: on the server
// one module instance serves every request, so nothing is ever stored there
// and translatorFor() answers with the key path. Anything rendered on the
// server must take `t` from getTranslations()/useTranslations() instead.

import { createTranslator } from "next-intl";

type Messages = Record<string, unknown>;
type Values = Record<string, string | number | Date>;
export type ModuleTranslator = (key: string, values?: Values) => string;

let current: { locale: string; messages: Messages } | null = null;
const translators = new Map<string, ModuleTranslator>();

/** Called by LocaleProvider in the browser whenever the language changes. */
export function setClientTranslations(locale: string, messages: Messages) {
  if (typeof window === "undefined") return;
  if (current?.locale === locale && current.messages === messages) return;
  current = { locale, messages };
  translators.clear();
}

/**
 * `translatorFor("common")("linkCopiedToClipboard")` — resolved when it is
 * called, so it always speaks the language the page is in at that moment.
 */
export function translatorFor(namespace: string): ModuleTranslator {
  return (key, values) => {
    if (!current) return `${namespace}.${key}`;
    let translate = translators.get(namespace);
    if (!translate) {
      translate = createTranslator({
        // Akan has no ICU data of its own; it follows British English.
        locale: current.locale === "ak" ? "en-GB" : current.locale,
        messages: current.messages,
        namespace,
        onError: () => {},
        getMessageFallback: ({ namespace: ns, key: k }) =>
          ns ? `${ns}.${k}` : k,
      }) as unknown as ModuleTranslator;
      translators.set(namespace, translate);
    }
    return translate(key, values);
  };
}
