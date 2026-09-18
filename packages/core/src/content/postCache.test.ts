import type { ContentPostDocument } from "@abonten/types/contentType";
import { describe, expect, it } from "vitest";
import { findPostDocument, patchPostDocuments } from "./postCache";

function post(id: string, likes = 0): ContentPostDocument {
  return {
    id,
    counts: { likes, reactions: 0, comments: 0, shares: 0, saves: 0, views: 0 },
    viewer: {
      liked: false,
      saved: false,
      reaction: null,
      following: false,
      seen: false,
      isAuthor: false,
      notInterested: false,
    },
  } as unknown as ContentPostDocument;
}

const like = (p: ContentPostDocument) => ({
  ...p,
  counts: { ...p.counts, likes: p.counts.likes + 1 },
  viewer: { ...p.viewer, liked: true },
});

describe("patchPostDocuments", () => {
  it("updates the post wherever it appears in a feed cache", () => {
    const feed = {
      pages: [
        { items: [{ post: post("a"), sponsored: null }] },
        { items: [{ post: post("b"), sponsored: null }] },
      ],
      pageParams: [null, "c"],
    };
    const next = patchPostDocuments(feed, "b", like);
    expect(next.pages[1].items[0].post.counts.likes).toBe(1);
    expect(next.pages[1].items[0].post.viewer.liked).toBe(true);
    // Untouched branches keep their identity.
    expect(next.pages[0]).toBe(feed.pages[0]);
    expect(next.pageParams).toBe(feed.pageParams);
  });

  it("updates a single-post envelope", () => {
    const envelope = { status: 200, data: { post: post("a", 2) } };
    expect(patchPostDocuments(envelope, "a", like).data.post.counts.likes).toBe(
      3,
    );
  });

  it("returns the same reference when the post is absent", () => {
    const data = { posts: [post("a")] };
    expect(patchPostDocuments(data, "zzz", like)).toBe(data);
  });

  it("ignores objects that only share the id (a comment, an event)", () => {
    const data = { comments: [{ id: "a", body: "hi" }] };
    expect(patchPostDocuments(data, "a", like)).toBe(data);
  });
});

describe("findPostDocument", () => {
  it("finds the first cached copy", () => {
    expect(
      findPostDocument({ x: [{ post: post("q", 5) }] }, "q")?.counts.likes,
    ).toBe(5);
    expect(findPostDocument({ x: [] }, "q")).toBeNull();
  });
});
