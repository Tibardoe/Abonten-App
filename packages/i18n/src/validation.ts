// The sentences @abonten/validation writes ("Username must be at least 3
// characters.") are English wherever a schema runs. This finds the catalog
// key of one — exactly, or by pattern when the schema put a value in it —
// so the place that shows it can word it in the reader's language:
//
//   web      FormMessage, useValidationText()      (apps/web/src/i18n)
//   native   Field, useValidationText()            (@abonten/ui-native/i18n)
//   server   translateServerText()                 (./server)
//
// Text that is not one of the schema's sentences comes back unchanged, so
// a message a service already translated passes through untouched.

import { VALIDATION_SOURCE } from "./validationIndex.generated";

export type ValidationMatch = { key: string; values: Record<string, string> };

type Index = {
  exact: Map<string, string>;
  patterns: { re: RegExp; key: string; count: number }[];
};

let index: Index | null = null;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildIndex(): Index {
  const exact = new Map<string, string>();
  const patterns: Index["patterns"] = [];
  for (const [key, quoted] of Object.entries(VALIDATION_SOURCE)) {
    // The catalog quotes a literal `<tag>` for ICU; the schema writes it bare.
    const english = quoted.replace(/'(<[^<>']*>)'/g, "$1");
    if (!/\{\d+\}/.test(english)) {
      exact.set(english, key);
      continue;
    }
    const parts = english.split(/\{\d+\}/);
    patterns.push({
      re: new RegExp(`^${parts.map(escapeRegExp).join("([\\s\\S]*?)")}$`),
      key,
      count: parts.length - 1,
    });
  }
  // Longer fixed text first, so a general pattern never swallows a specific one.
  patterns.sort((a, b) => b.re.source.length - a.re.source.length);
  return { exact, patterns };
}

/** The catalog key (and values) of a schema's English sentence, or null. */
export function matchValidationMessage(
  message: string | null | undefined,
): ValidationMatch | null {
  if (!message) return null;
  if (!index) index = buildIndex();
  const key = index.exact.get(message);
  if (key) return { key, values: {} };
  for (const pattern of index.patterns) {
    const m = message.match(pattern.re);
    if (!m) continue;
    const values: Record<string, string> = {};
    for (let i = 0; i < pattern.count; i++) values[String(i)] = m[i + 1] ?? "";
    return { key: pattern.key, values };
  }
  return null;
}

/**
 * A schema's message in the reader's language. `t` is a translator of the
 * `validation` namespace; anything it does not know is returned as it came.
 */
export function translateValidation(
  t: (key: string, values?: Record<string, string>) => string,
  message: string | null | undefined,
): string {
  if (!message) return "";
  const match = matchValidationMessage(message);
  return match ? t(match.key, match.values) : message;
}
