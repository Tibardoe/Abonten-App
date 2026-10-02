// "The same letters" for search: lower case, accents removed, letters that
// have no accent form written the way people type them on a plain keyboard
// (Twi, Ewe and Ga ɔ ɛ ɖ ƒ ŋ ʋ ɣ; Hausa and Fula ƙ ɓ ɗ ƴ; ø ł ß œ …), curly
// quotes and long dashes made plain.
//
// Mirror of public._search_fold() in
// supabase/migrations/20261002140000_search_reads_every_language.sql. The
// database is the authority for search itself (documents and queries are
// folded there); this copy is for what the apps compare on their own: a
// picker's filter, the category suggestions under the search box, the
// admin vocabulary form. search-languages.integration.test.ts checks the
// two give the same answer.

const TWO_LETTERS: Record<string, string> = {
  ß: "ss",
  œ: "oe",
  æ: "ae",
  þ: "th",
  ĳ: "ij",
};

const ONE_LETTER: Record<string, string> = {
  ø: "o",
  ł: "l",
  đ: "d",
  ð: "d",
  ı: "i",
  ħ: "h",
  ŧ: "t",
  ɔ: "o",
  ɛ: "e",
  ɖ: "d",
  ƒ: "f",
  ŋ: "n",
  ʋ: "v",
  ɣ: "g",
  ƙ: "k",
  ɓ: "b",
  ɗ: "d",
  ƴ: "y",
  ə: "e",
  "’": "'",
  "‘": "'",
  ʼ: "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
};

const MAPPED = /[ßœæþĳøłđðıħŧɔɛɖƒŋʋɣƙɓɗƴə’‘ʼ“”–—]/g;

/** Combining accents: what NFD splits off a letter (U+0300 to U+036F). */
const ACCENTS = new RegExp(
  `[${String.fromCodePoint(0x300)}-${String.fromCodePoint(0x36f)}]+`,
  "g",
);

export function foldSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(ACCENTS, "")
    .normalize("NFC")
    .replace(MAPPED, (letter) => TWO_LETTERS[letter] ?? ONE_LETTER[letter]);
}

/** Whether `text` contains `query`, letters compared as search compares them. */
export function foldedIncludes(text: string, query: string): boolean {
  return foldSearchText(text).includes(foldSearchText(query));
}
