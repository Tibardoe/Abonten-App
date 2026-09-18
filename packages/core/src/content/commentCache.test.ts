import type { ContentComment } from "@abonten/types/contentType";
import { describe, expect, it } from "vitest";
import {
  type CachedComment,
  type CommentsCache,
  appendComment,
  findComment,
  mergeFreshHead,
  patchComment,
  prependComment,
  removeComment,
  replaceComment,
} from "./commentCache";

function comment(id: string, over: Partial<CachedComment> = {}): CachedComment {
  return {
    id,
    postId: "p1",
    parentId: null,
    body: `body ${id}`,
    createdAt: "2026-09-18T10:00:00Z",
    likeCount: 0,
    replyCount: 0,
    author: {
      id: "u1",
      username: "ama",
      fullName: null,
      avatarPublicId: null,
      avatarVersion: null,
    } as ContentComment["author"],
    likedByMe: false,
    isMine: false,
    canModerate: false,
    ...over,
  };
}

function cache(
  ...pages: { ids: string[]; hasNextPage?: boolean }[]
): CommentsCache {
  return {
    pages: pages.map((p, i) => ({
      comments: p.ids.map((id) => comment(id)),
      hasNextPage: p.hasNextPage ?? i < pages.length - 1,
      nextCursor: p.hasNextPage ? `c${i}` : null,
    })),
    pageParams: pages.map((_, i) => (i === 0 ? null : `c${i - 1}`)),
  };
}

const ids = (c: CommentsCache | undefined | null) =>
  c?.pages.map((p) => p.comments.map((x) => x.id)) ?? null;

describe("prependComment", () => {
  it("puts a new comment first and never duplicates it", () => {
    const start = cache({ ids: ["b", "a"] });
    const once = prependComment(start, comment("c"));
    expect(ids(once)).toEqual([["c", "b", "a"]]);
    expect(ids(prependComment(once, comment("c")))).toEqual([["c", "b", "a"]]);
  });

  it("leaves an empty (not yet loaded) cache alone", () => {
    expect(prependComment(undefined, comment("x"))).toBeUndefined();
  });
});

describe("appendComment", () => {
  it("adds a reply at the end once the end is loaded", () => {
    expect(ids(appendComment(cache({ ids: ["a"] }), comment("b")))).toEqual([
      ["a", "b"],
    ]);
  });

  it("does not add it while later pages are still unfetched", () => {
    const start = cache({ ids: ["a"], hasNextPage: true });
    expect(appendComment(start, comment("b"))).toBe(start);
  });
});

describe("optimistic rows", () => {
  it("swaps a sending row for the server row by clientId", () => {
    const pending = comment("tmp", { clientId: "k1", localState: "sending" });
    const withPending = prependComment(cache({ ids: ["a"] }), pending);
    const confirmed = replaceComment(
      withPending,
      { id: "tmp", clientId: "k1" },
      comment("real", { clientId: "k1" }),
    );
    expect(ids(confirmed)).toEqual([["real", "a"]]);
    expect(findComment(confirmed, "real")?.localState).toBeUndefined();
  });

  it("removes a row by id", () => {
    expect(ids(removeComment(cache({ ids: ["a", "b"] }), { id: "a" }))).toEqual(
      [["b"]],
    );
  });
});

describe("patchComment", () => {
  it("returns the same reference when the comment is not in this list", () => {
    const start = cache({ ids: ["a"] });
    expect(patchComment(start, "zzz", (c) => ({ ...c, likeCount: 9 }))).toBe(
      start,
    );
  });

  it("updates every page that holds it", () => {
    const next = patchComment(
      cache({ ids: ["a"] }, { ids: ["b"] }),
      "b",
      (c) => ({
        ...c,
        likeCount: 3,
      }),
    );
    expect(findComment(next, "b")?.likeCount).toBe(3);
  });
});

describe("mergeFreshHead", () => {
  it("adds new comments on top without touching later pages", () => {
    const start = cache({ ids: ["c", "b"], hasNextPage: true }, { ids: ["a"] });
    const fresh = {
      comments: [comment("e"), comment("d"), comment("c"), comment("b")],
      hasNextPage: true,
      nextCursor: "x",
    };
    const next = mergeFreshHead(start, fresh);
    expect(ids(next)).toEqual([["e", "d", "c", "b"], ["a"]]);
    // The second page keeps its own cursor.
    expect(next?.pageParams).toEqual(start.pageParams);
  });

  it("takes the server's counts except for likes still in flight", () => {
    const start = cache({ ids: ["b", "a"] });
    const fresh = {
      comments: [
        comment("b", { likeCount: 5 }),
        comment("a", { likeCount: 7, replyCount: 2 }),
      ],
      hasNextPage: false,
      nextCursor: null,
    };
    const next = mergeFreshHead(start, fresh, new Set(["a"]));
    expect(findComment(next, "b")?.likeCount).toBe(5);
    expect(findComment(next, "a")?.likeCount).toBe(0);
  });

  it("keeps rows still being sent above the new ones", () => {
    const start = prependComment(
      cache({ ids: ["a"] }),
      comment("tmp", { clientId: "k", localState: "sending" }),
    );
    const fresh = {
      comments: [comment("n"), comment("a")],
      hasNextPage: false,
      nextCursor: null,
    };
    expect(ids(mergeFreshHead(start, fresh))).toEqual([["tmp", "n", "a"]]);
  });

  it("reports a gap when a full fresh page shares nothing with the cache", () => {
    const start = cache({ ids: ["a"] });
    const fresh = {
      comments: [comment("z"), comment("y")],
      hasNextPage: true,
      nextCursor: "q",
    };
    expect(mergeFreshHead(start, fresh)).toBeNull();
  });
});
