// Editorial text in Abonten Weekly (titles, intros, headlines, blurbs,
// editorial section bodies) is plain text. It is written by staff but still
// treated as untrusted at every boundary: normalised here, length-checked by
// zod and by CHECK constraints, and always rendered as a text node, never as
// HTML. Paragraph breaks are kept in multi-line fields; everything else that
// could smuggle layout or control behaviour is removed.

// C0/C1 controls except tab and newline, plus zero-width and bidirectional
// override characters that can disguise text. Built from code points so the
// source file stays plain ASCII.
const CONTROL_CHARS = new RegExp(
  [
    "[",
    "\\u0000-\\u0008",
    "\\u000B\\u000C",
    "\\u000E-\\u001F",
    "\\u007F-\\u009F",
    "\\u200B-\\u200F",
    "\\u202A-\\u202E",
    "\\u2066-\\u2069",
    "\\uFEFF",
    "]",
  ].join(""),
  "g",
);

/** One-line fields: titles, subtitles, headlines. */
export function sanitizeWeeklyLine(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
}

/** Multi-line fields: intros, blurbs, editorial bodies. At most one blank line between paragraphs. */
export function sanitizeWeeklyText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Null for an empty result, so optional columns store null rather than "". */
export function sanitizeWeeklyOptional(
  value: string | null | undefined,
  multiline = false,
): string | null {
  const cleaned = multiline
    ? sanitizeWeeklyText(value)
    : sanitizeWeeklyLine(value);
  return cleaned.length > 0 ? cleaned : null;
}

/** Split a body into paragraphs for rendering as separate text blocks. */
export function weeklyParagraphs(value: string | null | undefined): string[] {
  return sanitizeWeeklyText(value)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}
