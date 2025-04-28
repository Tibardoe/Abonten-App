import { languages } from "@/data/languages";
import { defineRouting } from "next-intl/routing";

const locales = languages.map((language) => language.code);

export const routing = defineRouting({
  // A list of all locales that are supported
  locales,

  // Used when no locale matches
  defaultLocale: "en",
});
