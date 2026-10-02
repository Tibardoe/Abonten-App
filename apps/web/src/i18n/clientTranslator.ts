// A translator for browser code that is not a component or a hook: a click
// handler in a plain module (share, upload, attach a file) that has to word
// a toast or an error. Components and hooks use useTranslations(); this is
// only for the helpers they call.
//
// The providers hand over the language and the messages the page holds
// (i18n/MessageLoader.tsx: the ones every page brings, plus the ones of the
// part of the site it is in), so a helper says exactly what the screen
// around it says. It is BROWSER-ONLY: on the server
// one module instance serves every request, so nothing is ever stored there
// and translatorFor() answers with the key path. Anything rendered on the
// server must take `t` from getTranslations()/useTranslations() instead.

import { mergeMessages } from "@abonten/core/i18n/pickMessages";
import { createTranslator } from "next-intl";

type Messages = Record<string, unknown>;
type Values = Record<string, string | number | Date>;
export type ModuleTranslator = (key: string, values?: Values) => string;

let current: { locale: string; messages: Messages } | null = null;
const translators = new Map<string, ModuleTranslator>();
// Message sets already folded in: a provider hands the same one over on
// every render.
let folded = new WeakSet<Messages>();
let requestNamespace: ((namespace: string) => void) | null = null;

/**
 * Called by the message providers in the browser. Messages only ever add
 * up within one language: leaving a part of the site does not take its
 * words away from a helper that is still running.
 */
export function addClientTranslations(locale: string, messages: Messages) {
  if (typeof window === "undefined") return;
  if (current?.locale !== locale) {
    current = { locale, messages };
    folded = new WeakSet([messages]);
    translators.clear();
    return;
  }
  if (folded.has(messages)) return;
  folded.add(messages);
  current = { locale, messages: mergeMessages(current.messages, messages) };
  translators.clear();
}

/** How a helper asks for a namespace the page did not bring. */
export function setNamespaceRequester(
  request: ((namespace: string) => void) | null,
) {
  requestNamespace = request;
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
        getMessageFallback: ({ namespace: ns, key: k }) => {
          // Not on this page: fetch it, so the next time it is said right.
          requestNamespace?.(namespace);
          return ns ? `${ns}.${k}` : k;
        },
      }) as unknown as ModuleTranslator;
      translators.set(namespace, translate);
    }
    return translate(key, values);
  };
}
