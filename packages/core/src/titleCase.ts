// Tidying a title someone typed, without destroying the words they meant.
//
// Every title-formatting site in the app used to run
// `word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()` over each
// space-separated word. That normalises A SHOUTED TITLE, which is the point,
// but it also flattens every acronym in it: "DJ Night" became "Dj Night",
// "VIP Gala" became "Vip Gala", "MTN Pulse" became "Mtn Pulse". On a
// Ghanaian events app those are ordinary words — the app's own category list
// ships "DJ Parties" with the caps intact, so an event tagged #DJ Parties
// was being titled "Dj Parties".
//
// Shape alone cannot separate an acronym from shouting — "VVIP" and "SHOW"
// look identical. The signal that settles it is the rest of the title: a
// word in capitals inside an otherwise normally-typed title is deliberate,
// while a title with no lower-case letter anywhere is simply shouted. So:
//
//   • a title containing no lower-case letter at all is normalised whole —
//     "A SHOUTED TITLE" and "AMAZING SHOW" come out title-cased.
//   • otherwise an all-caps run of 2-5 letters/digits is left as typed —
//     DJ, VIP, VVIP, MTN, AFCON. The length cap keeps a long shouted word
//     inside a mixed title ("The AMAZING Show") from surviving.
//   • a word with a capital after its first character is always left as
//     typed — McCarthy, iPhone, AfroBeats.

/** DJ, VIP, VVIP, MTN, AFCON, 4X4 — short, entirely upper-case, no lower. */
const ACRONYM = /^[A-Z0-9]{2,5}$/;

const LOWER = /[a-z]/;
const UPPER = /[A-Z]/;

/**
 * McCarthy, iPhone, AfroBeats — genuinely mixed case: a capital somewhere
 * after the first character AND a lower-case letter somewhere. Requiring the
 * lower-case letter is what stops an all-caps word like "AMAZING" (which
 * also has capitals after its first character) from counting as mixed.
 */
function isMixedCase(word: string): boolean {
  return LOWER.test(word) && UPPER.test(word.slice(1));
}

function formatWord(word: string, allowAcronyms: boolean): string {
  if (word.length === 0) return word;

  if (allowAcronyms) {
    // Compare against the letters only so "DJ!" and "(VIP)" still count.
    const letters = word.replace(/[^A-Za-z0-9]/g, "");
    if (letters.length > 0 && ACRONYM.test(letters)) return word;
  }

  if (isMixedCase(word)) return word;

  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Title-cases a user-typed title, preserving acronyms and intentional inner
 * capitals. Whitespace between words is preserved as typed.
 */
export function formatTitle(title: string): string {
  // No lower-case letter anywhere means the whole thing was shouted, so
  // nothing in it is an acronym worth keeping.
  const allowAcronyms = LOWER.test(title);

  return title
    .split(" ")
    .map((word) => formatWord(word, allowAcronyms))
    .join(" ");
}
