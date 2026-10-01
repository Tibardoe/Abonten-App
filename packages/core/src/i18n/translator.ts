// The contract between the framework-free copy helpers in @abonten/core and
// the apps that render their words. A helper never holds English itself: it
// takes a translator scoped to the `core` namespace of packages/i18n (the
// web app hands over `useTranslations("core")` / `getTranslations("core")`,
// the native app `useTranslations("core")` from @abonten/ui-native, the
// admin console and the services the English or recipient-language
// translator from @abonten/i18n/server) and asks it for keys such as
// "eventCta.buy". Keys live beside the helper that uses them so a renamed
// key is a one-file change, and every key is checked against the English
// catalog by packages/core/src/i18n/coreKeys.test.ts.

export type TranslationValues = Record<string, string | number | Date>;

/** A translator scoped to the `core` namespace. */
export type CoreTranslator = (
  key: string,
  values?: TranslationValues,
) => string;

/** A translator plus the language it speaks, for helpers that also format. */
export type CoreI18n = { locale: string; t: CoreTranslator };
