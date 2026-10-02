// The English (and one non-English) translator for this package's unit
// tests: the real catalog through the real server translator, so a test
// that reads "Reserve spot" is also checking the key exists.

import { coreTranslator } from "@abonten/i18n/server";
import type { CoreI18n, CoreTranslator } from "./translator";

export const t: CoreTranslator = coreTranslator("en");
export const tFr: CoreTranslator = coreTranslator("fr");

export const i18nEn: CoreI18n = { locale: "en", t };
export const i18nFr: CoreI18n = { locale: "fr", t: tFr };
