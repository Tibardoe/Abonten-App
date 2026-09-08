// "Is this message nothing but emoji?" — drives the oversized, chrome-free
// rendering mature messengers give a bare 😂 or ❤️🔥 (spec §13).
//
// Rules:
//   • 1–3 emoji  → display large (expressive)
//   • 4+ emoji   → display medium (a long sequence shouldn't eat the screen)
//   • any letter / digit / punctuation mixed in → NOT emoji-only (normal text
//     that merely contains an emoji stays a normal bubble)
//
// Hermes (RN 0.81 / Expo SDK 57) supports Unicode property escapes, but we
// still build the matcher inside a try/catch and fall back to a coarse range
// test so a future engine change can never crash the thread at import time.

type EmojiVerdict = { emojiOnly: boolean; count: number };

const NON_EMOJI = /[0-9A-Za-zÀ-ɏЀ-ӿ؀-ۿ]/;

let clusterRe: RegExp | null = null;
try {
  // An emoji "cluster": a pictographic base, optional variation selector /
  // skin-tone modifier, then any number of ZWJ-joined pictographs. Built via
  // `new RegExp` (not a literal) on purpose \u2014 a literal with `\p{...}` fails
  // at module PARSE time on an engine without Unicode property escapes, which
  // no try/catch here could catch; this way the fallback path still works.
  // biome-ignore lint/complexity/useRegexLiterals: must be runtime-constructed for the fallback to matter
  clusterRe = new RegExp(
    "\\p{Extended_Pictographic}(?:\\uFE0F|\\u{1F3FB}-\\u{1F3FF})?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F)?)*",
    "gu",
  );
} catch {
  clusterRe = null;
}

// Fallback: the common emoji blocks + symbols, regional indicators, dingbats.
const FALLBACK_EMOJI = /[←-⇿⌀-➿⬀-⯿\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}️‍]/gu;

/**
 * @param text raw message content
 * @returns whether it is purely emoji, and how many emoji clusters it has
 */
export function classifyEmojiOnly(
  text: string | null | undefined,
): EmojiVerdict {
  const t = (text ?? "").trim();
  if (!t) return { emojiOnly: false, count: 0 };
  if (t.length > 24) return { emojiOnly: false, count: 0 }; // long → definitely text

  // Strip whitespace + every emoji cluster; anything left means it's text.
  const stripped = t
    .replace(clusterRe ?? FALLBACK_EMOJI, "")
    .replace(/\s+/g, "")
    .trim();
  if (stripped.length > 0 || NON_EMOJI.test(t)) {
    return { emojiOnly: false, count: 0 };
  }

  let count = 0;
  if (clusterRe) {
    clusterRe.lastIndex = 0;
    for (const _ of t.matchAll(clusterRe)) count++;
  } else {
    // Coarse: count non-space code points.
    count = Array.from(t.replace(/\s+/g, "")).length;
  }
  if (count === 0) return { emojiOnly: false, count: 0 };
  return { emojiOnly: true, count };
}

/** Font size for an emoji-only bubble body, by cluster count. */
export function emojiOnlyFontSize(count: number): number {
  if (count <= 1) return 46;
  if (count <= 3) return 38;
  if (count <= 6) return 28;
  return 22;
}
