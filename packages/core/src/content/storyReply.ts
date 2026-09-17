// A reply or reaction to a Story is a private conversation message. The
// send_story_reply RPC (migration 20260917120000) stamps the Story it came
// from into message.system_data.story_reply; these helpers read that back
// for every client so web and mobile word it the same way.

export type StoryReplyKind = "text" | "reaction";

export type StoryReplyContext = {
  postId: string;
  kind: StoryReplyKind;
  storyAuthorId: string | null;
  publisherKind: "organizer" | "place" | null;
  thumbnailUrl: string | null;
  mediaType: "image" | "video" | null;
  expiresAt: string | null;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** The Story context of a message, or null for an ordinary message. */
export function readStoryReplyContext(
  systemData: Record<string, unknown> | null | undefined,
): StoryReplyContext | null {
  const raw = systemData?.story_reply;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const postId = str(r.post_id);
  if (!postId) return null;
  const publisherKind = str(r.publisher_kind);
  const mediaType = str(r.media_type);
  return {
    postId,
    kind: r.kind === "reaction" ? "reaction" : "text",
    storyAuthorId: str(r.story_author_id),
    publisherKind:
      publisherKind === "organizer" || publisherKind === "place"
        ? publisherKind
        : null,
    thumbnailUrl: str(r.thumbnail_url),
    mediaType:
      mediaType === "image" || mediaType === "video" ? mediaType : null,
    expiresAt: str(r.expires_at),
  };
}

/** Whether the Story can still be opened (Stories last a day). */
export function storyReplyStoryLive(
  ctx: Pick<StoryReplyContext, "expiresAt">,
  now: number = Date.now(),
): boolean {
  if (!ctx.expiresAt) return false;
  const t = Date.parse(ctx.expiresAt);
  return Number.isFinite(t) && t > now;
}

/**
 * The line above the bubble. `mine` = the viewer sent it; `senderName` is
 * used when someone else did ("Ama replied to your story").
 */
export function storyReplyLabel(
  ctx: Pick<StoryReplyContext, "kind">,
  mine: boolean,
  senderName?: string | null,
): string {
  const verb = ctx.kind === "reaction" ? "reacted to" : "replied to";
  if (mine) return `You ${verb} their story`;
  const who = senderName?.trim();
  return who
    ? `${who} ${verb} your story`
    : `${verb[0].toUpperCase()}${verb.slice(1)} your story`;
}

/** Notification body for the Story's publisher. */
export function storyReplyNotificationBody(
  kind: StoryReplyKind,
  content: string,
): string {
  const text = content.trim();
  return (
    kind === "reaction"
      ? `Reacted ${text} to your story`
      : `Replied to your story: ${text}`
  ).slice(0, 140);
}
