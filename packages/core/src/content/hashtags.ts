// Hashtags are stored normalised (lowercase, letters/digits/underscore, no
// '#', at most 15) — the CHECK on content_post.hashtags caps the count.

export const MAX_HASHTAGS = 15;
export const MAX_HASHTAG_LENGTH = 30;

const TAG_PATTERN = /#([\p{L}\p{N}_]{1,30})/gu;

export function normalizeHashtag(raw: string): string | null {
  const tag = raw.trim().replace(/^#/, "").toLowerCase();
  if (!tag || tag.length > MAX_HASHTAG_LENGTH) return null;
  if (!/^[\p{L}\p{N}_]+$/u.test(tag)) return null;
  return tag;
}

/** Tags typed in the caption plus explicit ones, de-duplicated and capped. */
export function collectHashtags(
  caption: string | null | undefined,
  explicit: readonly string[] = [],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const tag = normalizeHashtag(raw);
    if (!tag || seen.has(tag) || out.length >= MAX_HASHTAGS) return;
    seen.add(tag);
    out.push(tag);
  };
  for (const raw of explicit) push(raw);
  for (const match of (caption ?? "").matchAll(TAG_PATTERN)) push(match[1]);
  return out;
}
