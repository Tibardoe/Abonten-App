// Framework-agnostic access to the translation catalogs in ../messages.
// The web app wraps this with next-intl (src/i18n/messages.ts); the native
// app uses the static map in @abonten/ui-native (Metro cannot bundle the
// templated import below). The locale and namespace lists are generated
// from the messages directory by scripts/i18n/gen-catalog-index.mjs.

import {
  I18N_NAMESPACES,
  type I18nLocale,
  type I18nNamespace,
} from "./namespaces";

export {
  I18N_LOCALES,
  type I18nLocale,
  I18N_NAMESPACES,
  type I18nNamespace,
} from "./namespaces";

// Static prefix + template so the bundler can split one lazy chunk per
// (locale, namespace).
export async function loadNamespace(
  locale: I18nLocale,
  namespace: I18nNamespace,
): Promise<Record<string, unknown>> {
  const mod = await import(`../messages/${locale}/${namespace}.json`);
  return (mod.default ?? mod) as Record<string, unknown>;
}

export async function loadAllNamespaces(
  locale: I18nLocale,
): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    I18N_NAMESPACES.map(
      async (namespace) =>
        [namespace, await loadNamespace(locale, namespace)] as const,
    ),
  );
  return Object.fromEntries(entries);
}
