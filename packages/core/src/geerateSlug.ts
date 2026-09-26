// Letters of Ghanaian languages (Twi, Ga, Ewe, Dagbani) that have no
// decomposition to a Latin base letter, so NFKD alone would drop them.
// "Abɔnten Night" must slug to "abonten-night", not "abnten-night".
const GHANAIAN_LETTERS: Record<string, string> = {
  ɔ: "o",
  ɛ: "e",
  ŋ: "n",
  ɖ: "d",
  ƒ: "f",
  ɣ: "g",
  ʋ: "v",
};

export function generateSlug(title: string) {
  return title
    .toLowerCase() // Convert to lowercase
    .replace(/[ɔɛŋɖƒɣʋ]/g, (ch) => GHANAIAN_LETTERS[ch] ?? ch) // Ghanaian letters to their Latin base
    .normalize("NFKD") // Split accented letters (é → e + ´) ...
    .replace(/\p{M}/gu, "") // ... and drop the accents
    .replace(/[^\w\s-]/g, "") // Remove non-alphanumeric characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-"); // Replace multiple hyphens with a single hyphen
}

export function undoSlug(slug: string) {
  return slug
    .replace(/-/g, " ") // Hyphens to spaces
    .replace(/\b\w/g, (char) => char.toUpperCase()); // Capitalize words
}
