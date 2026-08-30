// Framework-agnostic access to the translation catalogs in ../messages.
// The web app wraps this with next-intl (src/i18n/messages.ts); a native
// app can call loadAllNamespaces directly.

export const I18N_LOCALES = ["en", "fr", "es", "de", "pt", "ak"] as const;
export type I18nLocale = (typeof I18N_LOCALES)[number];

export const I18N_NAMESPACES = [
  "common",
  "navigation",
  "auth",
  "settings",
  "events",
  "places",
] as const;
export type I18nNamespace = (typeof I18N_NAMESPACES)[number];

// Static prefix + template so the bundler can split one lazy chunk per
// (locale, namespace) — the same shape the web app used before extraction.
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
