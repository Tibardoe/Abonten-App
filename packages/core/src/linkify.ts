// Find web links inside free text (chat messages, descriptions) so a UI can
// render them as tappable spans, without ever treating the text as markup.
//
// Deliberately conservative:
//   • only http(s) URLs and bare `www.` hosts are recognised — no javascript:,
//     data:, file: or custom schemes, so a message can never become a way to
//     make the app open something it shouldn't;
//   • trailing punctuation that is almost always sentence punctuation rather
//     than part of the link (`.`, `,`, `!`, `?`, `:`, `;`, a closing bracket
//     with no matching opener) is left out of the link;
//   • `www.` links are given an https:// prefix in `href`, the text itself is
//     untouched;
//   • the result is a list of plain-text and link segments that concatenate
//     back to the original string exactly, so nothing is lost or reordered.

export type TextSegment =
  | { type: "text"; text: string }
  | { type: "link"; text: string; href: string };

// Scheme form, or a bare www. host. Hosts must contain a dot with a
// plausible TLD so "www.x" or "http://localhost" (no dot) are not linked.
const URL_RE =
  /\b(?:https?:\/\/[^\s<>"']+|www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[^\s<>"']*)?)/gi;

const TRAILING_PUNCT = /[.,!?:;'"]+$/;

function trimTrailing(raw: string): string {
  let out = raw.replace(TRAILING_PUNCT, "");
  // Drop an unbalanced closing bracket: "(see https://x.com/a)" should link
  // "https://x.com/a", while "https://en.wikipedia.org/wiki/Foo_(bar)" keeps
  // its ")" because the opener is inside the URL.
  for (const [open, close] of [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ] as const) {
    while (out.endsWith(close)) {
      const opens = out.split(open).length - 1;
      const closes = out.split(close).length - 1;
      if (closes > opens) out = out.slice(0, -1).replace(TRAILING_PUNCT, "");
      else break;
    }
  }
  return out;
}

function hrefFor(text: string): string | null {
  const href = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return href;
  } catch {
    return null;
  }
}

/** True when `href` is something the app may hand to a browser. */
export function isSafeWebUrl(href: string): boolean {
  return hrefFor(href) === href;
}

export function linkify(text: string): TextSegment[] {
  if (!text) return [];
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    const raw = match[0];
    const linkText = trimTrailing(raw);
    const href = linkText ? hrefFor(linkText) : null;
    if (!href) continue;
    if (start > last)
      segments.push({ type: "text", text: text.slice(last, start) });
    segments.push({ type: "link", text: linkText, href });
    last = start + linkText.length;
  }
  if (last < text.length)
    segments.push({ type: "text", text: text.slice(last) });
  return segments;
}

/** Cheap pre-check so callers can skip the parser for link-free text. */
export function hasLink(text: string | null | undefined): boolean {
  if (!text) return false;
  URL_RE.lastIndex = 0;
  const found = URL_RE.test(text);
  URL_RE.lastIndex = 0;
  return found;
}
