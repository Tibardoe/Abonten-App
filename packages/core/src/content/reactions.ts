import type { ContentReactionEmoji } from "@abonten/types/contentType";

// The Story reaction set. Mirrors the CHECK constraint on
// content_reaction.emoji (migration 20260916120000). One reaction per person
// per Story: choosing another emoji replaces it, choosing the same removes it.
export const CONTENT_REACTIONS: readonly ContentReactionEmoji[] = [
  "❤️",
  "🔥",
  "😂",
  "😍",
  "👏",
  "😮",
  "👍",
] as const;

export function isContentReaction(
  value: unknown,
): value is ContentReactionEmoji {
  return (
    typeof value === "string" &&
    (CONTENT_REACTIONS as readonly string[]).includes(value)
  );
}
