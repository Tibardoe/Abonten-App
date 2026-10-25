// Text for a search result or a link preview: one line, at most `max`
// characters, cut where a word ends. Search engines show about 155–160
// characters of a description and cut the rest themselves, often mid-word;
// an organizer's description also comes with line breaks and runs of
// spaces that read as nothing in a snippet.

export const SNIPPET_MAX = 160;

export function snippetText(
  text: string | null | undefined,
  max: number = SNIPPET_MAX,
): string {
  const line = (text ?? "").replace(/\s+/g, " ").trim();
  if (line.length <= max) return line;
  // Room for the ellipsis.
  const room = line.slice(0, max - 1);
  const endsOnWord = line[max - 1] === " ";
  const lastSpace = room.lastIndexOf(" ");
  // A single word longer than half the room is cut where it stands.
  const cut =
    endsOnWord || lastSpace <= max / 2 ? room : room.slice(0, lastSpace);
  return `${cut.replace(/[\s,.;:–—-]+$/u, "")}…`;
}
