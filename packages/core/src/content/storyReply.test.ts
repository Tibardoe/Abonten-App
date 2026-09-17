import { describe, expect, it } from "vitest";
import { contentDestinationCta } from "./copy";
import {
  readStoryReplyContext,
  storyReplyLabel,
  storyReplyNotificationBody,
  storyReplyStoryLive,
} from "./storyReply";

describe("story reply context", () => {
  it("reads the context send_story_reply writes", () => {
    const ctx = readStoryReplyContext({
      story_reply: {
        post_id: "p1",
        kind: "reaction",
        story_author_id: "u1",
        publisher_kind: "place",
        thumbnail_url: "https://res.cloudinary.com/x.jpg",
        media_type: "video",
        expires_at: "2026-09-18T10:00:00Z",
      },
    });
    expect(ctx).toEqual({
      postId: "p1",
      kind: "reaction",
      storyAuthorId: "u1",
      publisherKind: "place",
      thumbnailUrl: "https://res.cloudinary.com/x.jpg",
      mediaType: "video",
      expiresAt: "2026-09-18T10:00:00Z",
    });
  });

  it("treats ordinary and malformed messages as no Story context", () => {
    expect(readStoryReplyContext({})).toBeNull();
    expect(readStoryReplyContext(null)).toBeNull();
    expect(readStoryReplyContext({ initiator_id: "u" })).toBeNull();
    expect(readStoryReplyContext({ story_reply: "p1" })).toBeNull();
    expect(readStoryReplyContext({ story_reply: { kind: "text" } })).toBeNull();
    expect(
      readStoryReplyContext({
        story_reply: { post_id: "p", kind: "weird", media_type: "gif" },
      }),
    ).toMatchObject({ kind: "text", mediaType: null, publisherKind: null });
  });

  it("shows the Story preview only until it expires", () => {
    const now = Date.parse("2026-09-17T12:00:00Z");
    expect(
      storyReplyStoryLive({ expiresAt: "2026-09-17T12:00:01Z" }, now),
    ).toBe(true);
    expect(
      storyReplyStoryLive({ expiresAt: "2026-09-17T12:00:00Z" }, now),
    ).toBe(false);
    expect(storyReplyStoryLive({ expiresAt: null }, now)).toBe(false);
    expect(storyReplyStoryLive({ expiresAt: "not a date" }, now)).toBe(false);
  });

  it("words the reply from each side of the conversation", () => {
    expect(storyReplyLabel({ kind: "text" }, false, "Ama")).toBe(
      "Ama replied to your story",
    );
    expect(storyReplyLabel({ kind: "text" }, true, "Ama")).toBe(
      "You replied to their story",
    );
    expect(storyReplyLabel({ kind: "reaction" }, false, "")).toBe(
      "Reacted to your story",
    );
    expect(storyReplyNotificationBody("reaction", " 🔥 ")).toBe(
      "Reacted 🔥 to your story",
    );
    expect(storyReplyNotificationBody("text", "x".repeat(300))).toHaveLength(
      140,
    );
  });
});

describe("overlay destination CTA", () => {
  const base = {
    event: null,
    place: null,
    publisher: { kind: "organizer" as const },
  } satisfies Parameters<typeof contentDestinationCta>[0];

  it("drops the publisher fallbacks the tappable identity already covers", () => {
    expect(contentDestinationCta(base)).toEqual({ label: "", target: null });
    expect(
      contentDestinationCta({ ...base, publisher: { kind: "place" } }),
    ).toEqual({ label: "", target: null });
  });

  it("keeps attached events and places, including their live state", () => {
    expect(
      contentDestinationCta({
        ...base,
        event: {
          available: true,
          status: "published",
          archived: false,
          ended: false,
          soldOut: false,
        },
      }),
    ).toEqual({ label: "View event", target: "event" });
    expect(
      contentDestinationCta({
        ...base,
        place: { available: false, temporaryStatus: "permanently_closed" },
      }),
    ).toEqual({ label: "Permanently closed", target: null });
  });
});
