// The language Google's maps and place services answer in, for an app
// language. Akan is not one of Google's languages; it reads English.
const GOOGLE_LANGUAGE: Record<string, string> = {
  en: "en-GB",
  fr: "fr",
  es: "es",
  de: "de",
  pt: "pt-PT",
  ak: "en-GB",
};

export function googleMapsLanguage(locale: string): string {
  return GOOGLE_LANGUAGE[locale] ?? "en-GB";
}
