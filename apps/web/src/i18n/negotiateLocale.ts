import { type Locale, defaultLocale, isLocale } from "./config";

// Parses a raw `Accept-Language` header (e.g. "fr-FR,fr;q=0.9,en;q=0.8")
// and returns the highest-quality supported locale, or the default.
export function getPreferredLocale(
  acceptLanguageHeader: string | null,
): Locale {
  if (!acceptLanguageHeader) return defaultLocale;

  const ranked = acceptLanguageHeader
    .split(",")
    .map((part) => {
      const [tag, qPart] = part.trim().split(";q=");
      const primary = tag.split("-")[0]?.toLowerCase();
      const quality = qPart ? Number(qPart) : 1;
      return { primary, quality };
    })
    .sort((a, b) => b.quality - a.quality);

  const match = ranked.find((entry) => isLocale(entry.primary));

  return match && isLocale(match.primary) ? match.primary : defaultLocale;
}
