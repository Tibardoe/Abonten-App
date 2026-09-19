// The search vocabulary (public.search_concept): a term people type and the
// words that express it in listings. These rules mirror the table's CHECK
// constraints, so the admin form can explain a problem before the database
// refuses it, and the service normalises input the same way every time.

export const SEARCH_CONCEPT_SCOPES = ["event", "place", "spotlight"] as const;
export type SearchConceptScope = (typeof SEARCH_CONCEPT_SCOPES)[number];

export const SEARCH_CONCEPT_MAX_WORDS = 30;
const MAX_TERM_LENGTH = 60;

export type SearchConcept = {
  id: number;
  term: string;
  expandsTo: string[];
  appliesTo: SearchConceptScope[];
  enabled: boolean;
  note: string | null;
  updatedAt: string;
};

export type SearchVocabularyGap = {
  query_norm: string;
  searches: number;
  zero_results: number;
  clicks: number;
  last_seen: string;
  /** The vocabulary already widens at least one word of this query. */
  covered: boolean;
};

export type SearchVocabulary = {
  days: number;
  concepts: SearchConcept[];
  gaps: SearchVocabularyGap[];
};

export type SearchConceptPreview = {
  query: string | null;
  events?: { count: number; samples: string[] };
  places?: { count: number; samples: string[] };
  spotlights?: { count: number; samples: string[] };
};

/** Lower case, single spaces, trimmed — the form search queries are stored in. */
export function normalizeConceptWord(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * The alternatives typed as one text (commas or new lines between them),
 * normalised, without blanks, repeats or the term itself, in the order
 * given.
 */
export function parseConceptWords(text: string, term = ""): string[] {
  const own = normalizeConceptWord(term);
  const seen = new Set<string>();
  const words: string[] = [];
  for (const part of text.split(/[,\n]/)) {
    const word = normalizeConceptWord(part);
    if (!word || word === own || seen.has(word)) continue;
    seen.add(word);
    words.push(word);
  }
  return words;
}

/** Why this concept would be refused, or null when it is fine. */
export function conceptProblem(input: {
  term: string;
  expandsTo: string[];
  appliesTo: string[];
}): string | null {
  const term = normalizeConceptWord(input.term);
  if (!term) return "Enter the term people type.";
  if (term.length > MAX_TERM_LENGTH) {
    return `Keep the term under ${MAX_TERM_LENGTH} characters.`;
  }
  if (!/[\p{L}\p{N}]/u.test(term)) {
    return "The term needs at least one letter or number.";
  }
  if (input.expandsTo.length === 0) {
    return "Add at least one word that listings use for it.";
  }
  if (input.expandsTo.length > SEARCH_CONCEPT_MAX_WORDS) {
    return `At most ${SEARCH_CONCEPT_MAX_WORDS} words per term.`;
  }
  if (input.expandsTo.some((w) => w.length > MAX_TERM_LENGTH)) {
    return `Keep each word under ${MAX_TERM_LENGTH} characters.`;
  }
  if (input.appliesTo.length === 0) {
    return "Choose at least one of events, places or Spotlights.";
  }
  if (
    input.appliesTo.some(
      (s) => !(SEARCH_CONCEPT_SCOPES as readonly string[]).includes(s),
    )
  ) {
    return "Unknown result type.";
  }
  return null;
}
