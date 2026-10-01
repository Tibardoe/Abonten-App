// Static catalog map for React Native. The web app lazy-imports each
// (locale, namespace) chunk via next-intl; Metro can't bundle the templated
// `import()` in @abonten/i18n/catalog, so the native app bundles every
// catalog and picks at runtime. Source of truth is the JSON under
// @abonten/i18n/messages; the import list is generated from that directory
// by scripts/i18n/gen-catalog-index.mjs (CI checks it is current).

export {
  CATALOG,
  type LocaleMessages,
  type Messages,
} from "./catalog.generated";
export {
  I18N_LOCALES,
  type I18nLocale,
  I18N_NAMESPACES,
  type I18nNamespace,
} from "@abonten/i18n/namespaces";

// How each language names itself: a person who cannot read the current
// language must still find their own in the list.
export const LOCALE_LABELS = {
  en: "English",
  fr: "Français",
  es: "Español",
  de: "Deutsch",
  pt: "Português",
  ak: "Twi",
} as const satisfies Record<string, string>;
