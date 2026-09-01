// Static catalog map for React Native. The web app lazy-imports each
// (locale, namespace) chunk via next-intl; Metro can't bundle the templated
// `import()` in @abonten/i18n/catalog, and the six catalogs are small, so
// the native app bundles them all and picks at runtime. Source of truth is
// still the JSON under @abonten/i18n/messages — this file only wires it up.

import akAuth from "@abonten/i18n/messages/ak/auth.json";
import akCommon from "@abonten/i18n/messages/ak/common.json";
import akEvents from "@abonten/i18n/messages/ak/events.json";
import akNavigation from "@abonten/i18n/messages/ak/navigation.json";
import akPlaces from "@abonten/i18n/messages/ak/places.json";
import akSettings from "@abonten/i18n/messages/ak/settings.json";
import deAuth from "@abonten/i18n/messages/de/auth.json";
import deCommon from "@abonten/i18n/messages/de/common.json";
import deEvents from "@abonten/i18n/messages/de/events.json";
import deNavigation from "@abonten/i18n/messages/de/navigation.json";
import dePlaces from "@abonten/i18n/messages/de/places.json";
import deSettings from "@abonten/i18n/messages/de/settings.json";
import enAuth from "@abonten/i18n/messages/en/auth.json";
import enCommon from "@abonten/i18n/messages/en/common.json";
import enEvents from "@abonten/i18n/messages/en/events.json";
import enNavigation from "@abonten/i18n/messages/en/navigation.json";
import enPlaces from "@abonten/i18n/messages/en/places.json";
import enSettings from "@abonten/i18n/messages/en/settings.json";
import esAuth from "@abonten/i18n/messages/es/auth.json";
import esCommon from "@abonten/i18n/messages/es/common.json";
import esEvents from "@abonten/i18n/messages/es/events.json";
import esNavigation from "@abonten/i18n/messages/es/navigation.json";
import esPlaces from "@abonten/i18n/messages/es/places.json";
import esSettings from "@abonten/i18n/messages/es/settings.json";
import frAuth from "@abonten/i18n/messages/fr/auth.json";
import frCommon from "@abonten/i18n/messages/fr/common.json";
import frEvents from "@abonten/i18n/messages/fr/events.json";
import frNavigation from "@abonten/i18n/messages/fr/navigation.json";
import frPlaces from "@abonten/i18n/messages/fr/places.json";
import frSettings from "@abonten/i18n/messages/fr/settings.json";
import ptAuth from "@abonten/i18n/messages/pt/auth.json";
import ptCommon from "@abonten/i18n/messages/pt/common.json";
import ptEvents from "@abonten/i18n/messages/pt/events.json";
import ptNavigation from "@abonten/i18n/messages/pt/navigation.json";
import ptPlaces from "@abonten/i18n/messages/pt/places.json";
import ptSettings from "@abonten/i18n/messages/pt/settings.json";

// Kept in sync by hand with @abonten/i18n/catalog's I18N_LOCALES — importing
// that module would drag in its Metro-incompatible templated import().
export const I18N_LOCALES = ["en", "fr", "es", "de", "pt", "ak"] as const;
export type I18nLocale = (typeof I18N_LOCALES)[number];

export type Messages = Record<string, unknown>;
export type LocaleMessages = Record<string, Messages>;

export const CATALOG: Record<I18nLocale, LocaleMessages> = {
  en: {
    common: enCommon,
    navigation: enNavigation,
    auth: enAuth,
    settings: enSettings,
    events: enEvents,
    places: enPlaces,
  },
  fr: {
    common: frCommon,
    navigation: frNavigation,
    auth: frAuth,
    settings: frSettings,
    events: frEvents,
    places: frPlaces,
  },
  es: {
    common: esCommon,
    navigation: esNavigation,
    auth: esAuth,
    settings: esSettings,
    events: esEvents,
    places: esPlaces,
  },
  de: {
    common: deCommon,
    navigation: deNavigation,
    auth: deAuth,
    settings: deSettings,
    events: deEvents,
    places: dePlaces,
  },
  pt: {
    common: ptCommon,
    navigation: ptNavigation,
    auth: ptAuth,
    settings: ptSettings,
    events: ptEvents,
    places: ptPlaces,
  },
  ak: {
    common: akCommon,
    navigation: akNavigation,
    auth: akAuth,
    settings: akSettings,
    events: akEvents,
    places: akPlaces,
  },
};

export const LOCALE_LABELS: Record<I18nLocale, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  de: "Deutsch",
  pt: "Português",
  ak: "Akan (Twi)",
};
