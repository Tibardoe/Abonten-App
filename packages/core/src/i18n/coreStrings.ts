// The handful of phrases the framework-free formatters in @abonten/core
// produce themselves (a missing date, "Today" above a chat day). Everything
// else a person reads lives in packages/i18n; these stay here because the
// formatters are called from both apps with only a locale to hand.

export type CoreLocale = "en" | "fr" | "es" | "de" | "pt" | "ak";

const STRINGS = {
  dateTbc: {
    en: "Date TBC",
    fr: "Date à confirmer",
    es: "Fecha por confirmar",
    de: "Datum folgt",
    pt: "Data a confirmar",
    ak: "Da no bɛba",
  },
  dateNotAvailable: {
    en: "Date not available",
    fr: "Date non disponible",
    es: "Fecha no disponible",
    de: "Datum nicht verfügbar",
    pt: "Data não disponível",
    ak: "Da no nni hɔ",
  },
  timeNotAvailable: {
    en: "Time not available",
    fr: "Heure non disponible",
    es: "Hora no disponible",
    de: "Uhrzeit nicht verfügbar",
    pt: "Hora não disponível",
    ak: "Bere no nni hɔ",
  },
  notAvailable: {
    en: "N/A",
    fr: "N/D",
    es: "N/D",
    de: "k. A.",
    pt: "N/D",
    ak: "N/A",
  },
  today: {
    en: "Today",
    fr: "Aujourd'hui",
    es: "Hoy",
    de: "Heute",
    pt: "Hoje",
    ak: "Ɛnnɛ",
  },
  yesterday: {
    en: "Yesterday",
    fr: "Hier",
    es: "Ayer",
    de: "Gestern",
    pt: "Ontem",
    ak: "Nnora",
  },
} as const;

export type CoreStringKey = keyof typeof STRINGS;

/** The language part of any locale tag ("fr-FR" → "fr"), English otherwise. */
export function coreLocale(locale: string | null | undefined): CoreLocale {
  const lang = (locale ?? "en").toLowerCase().split(/[-_]/)[0];
  return lang in STRINGS.today ? (lang as CoreLocale) : "en";
}

export function coreString(key: CoreStringKey, locale?: string | null): string {
  return STRINGS[key][coreLocale(locale)];
}

/**
 * The BCP 47 tag Intl should format with. Akan has no ICU data, and the
 * product's English is British (day-month order), so both map to en-GB.
 */
export function intlLocale(locale?: string | null): string {
  const lang = coreLocale(locale);
  return lang === "en" || lang === "ak" ? "en-GB" : lang;
}

/** True when the locale's conventions are the product's English ones. */
export function isEnglishLike(locale?: string | null): boolean {
  const lang = coreLocale(locale);
  return lang === "en" || lang === "ak";
}
