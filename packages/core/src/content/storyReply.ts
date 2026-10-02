import type { CoreTranslator } from "../i18n/translator";

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
 * used when someone else did ("Ama replied to your story"). Words live
 * under `storyReply.*` of the core namespace.
 */
export function storyReplyLabel(
  t: CoreTranslator,
  ctx: Pick<StoryReplyContext, "kind">,
  mine: boolean,
  senderName?: string | null,
): string {
  const reaction = ctx.kind === "reaction";
  if (mine) {
    return reaction ? t("storyReply.youReacted") : t("storyReply.youReplied");
  }
  const name = senderName?.trim();
  if (name) {
    return reaction
      ? t("storyReply.nameReacted", { name })
      : t("storyReply.nameReplied", { name });
  }
  return reaction ? t("storyReply.reacted") : t("storyReply.replied");
}

/** Notification body for the Story's publisher, in their language. */
export function storyReplyNotificationBody(
  t: CoreTranslator,
  kind: StoryReplyKind,
  content: string,
): string {
  const text = content.trim();
  return (
    kind === "reaction"
      ? t("storyReply.notifReacted", { text })
      : t("storyReply.notifReplied", { text })
  ).slice(0, 140);
}
