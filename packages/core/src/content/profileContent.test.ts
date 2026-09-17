import type { ContentOwnPost } from "@abonten/types/contentType";
import { describe, expect, it } from "vitest";
import {
  chunkRows,
  profileTabs,
  spotlightSegments,
  tileFromOwnPost,
} from "./profileContent";

function own(patch: Partial<ContentOwnPost> = {}): ContentOwnPost {
  return {
    id: "p1",
    kind: "spotlight",
    status: "published",
    moderationState: "visible",
    caption: null,
    publishedAt: "2026-09-16T00:00:00Z",
    expiresAt: null,
    createdAt: "2026-09-16T00:00:00Z",
    cover: {
      thumbnailUrl: "https://res.cloudinary.com/t.jpg",
      mediaUrl: "https://res.cloudinary.com/v.mp4",
      type: "video",
    },
    counts: {
      likes: 0,
      reactions: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      views: 42,
    },
    publisher: { kind: "organizer", placeId: null },
    eventId: null,
    placeId: null,
    campaign: null,
    ...patch,
  };
}

describe("profile content tabs", () => {
  it("replaces Places with Spotlights beside the Events/Places selector", () => {
    expect(profileTabs({ isOwn: true, spotlightOn: true })).toEqual([
      "listings",
      "spotlights",
      "favorites",
      "reviews",
    ]);
    expect(profileTabs({ isOwn: false, spotlightOn: true })).toEqual([
      "listings",
      "spotlights",
      "reviews",
    ]);
  });

  it("hides Spotlights while the programme is off", () => {
    expect(profileTabs({ isOwn: false, spotlightOn: false })).toEqual([
      "listings",
      "reviews",
    ]);
  });

  it("never offers saved or drafts on someone else's profile", () => {
    expect(spotlightSegments(true)).toEqual(["published", "saved", "drafts"]);
    expect(spotlightSegments(false)).toEqual(["published"]);
  });
});

describe("spotlight tiles", () => {
  it("opens live posts in the player and drafts in the manage screen", () => {
    expect(tileFromOwnPost(own())).toMatchObject({
      href: "/(app)/spotlight/p1",
      badge: null,
      views: 42,
      isVideo: true,
    });
    expect(tileFromOwnPost(own({ status: "draft" }))).toMatchObject({
      href: "/(app)/spotlight/post/p1",
      badge: "Draft",
    });
    expect(tileFromOwnPost(own({ moderationState: "hidden" }))).toMatchObject({
      href: "/(app)/spotlight/post/p1",
      badge: "Hidden",
    });
    expect(
      tileFromOwnPost(own({ moderationState: "restricted" })),
    ).toMatchObject({ href: "/(app)/spotlight/p1", badge: "Limited" });
  });

  it("never uses a video file as a thumbnail", () => {
    expect(
      tileFromOwnPost(
        own({
          cover: {
            thumbnailUrl: null,
            mediaUrl: "https://res.cloudinary.com/v.mp4",
            type: "video",
          },
        }),
      ).thumbnailUrl,
    ).toBeNull();
  });

  it("chunks a grid into rows", () => {
    expect(chunkRows([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [7],
    ]);
    expect(chunkRows([], 3)).toEqual([]);
  });
});
