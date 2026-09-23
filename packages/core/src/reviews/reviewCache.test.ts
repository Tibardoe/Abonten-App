import { describe, expect, it } from "vitest";
import {
  patchReviewInData,
  removeReviewsInData,
  withHelpfulVote,
} from "./reviewCache";
import type { ReviewListRow } from "./reviewList";

function row(id: string, reviewerId = "u1"): ReviewListRow {
  return {
    id,
    subjectId: "s",
    reviewerId,
    rating: 5,
    title: null,
    comment: null,
    createdAt: "2026-09-20T00:00:00Z",
    editedAt: null,
    helpfulCount: 2,
    viewerFoundHelpful: false,
    isVerifiedAttendee: null,
    response: null,
    responseAt: null,
    reviewer: {
      username: "a",
      fullName: null,
      avatarPublicId: null,
      avatarVersion: null,
      deleted: false,
    },
    photos: [],
  };
}

describe("review cache transforms", () => {
  it("patches a review inside infinite data, previews and envelopes", () => {
    const infinite = {
      pages: [{ reviews: [row("a"), row("b")], nextCursor: null }],
      pageParams: [null],
    };
    const next = patchReviewInData(infinite, "b", (r) =>
      withHelpfulVote(r, true),
    );
    expect(next.pages[0]?.reviews[1]).toMatchObject({
      helpfulCount: 3,
      viewerFoundHelpful: true,
    });
    expect(next.pages[0]?.reviews[0]?.helpfulCount).toBe(2);
    expect(infinite.pages[0]?.reviews[1]?.helpfulCount).toBe(2);

    const envelope = { status: 200, data: { reviews: [row("b")] } };
    expect(
      patchReviewInData(envelope, "b", (r) => withHelpfulVote(r, true)).data
        .reviews[0]?.helpfulCount,
    ).toBe(3);

    expect(
      patchReviewInData([row("b")], "b", (r) => withHelpfulVote(r, true))[0]
        ?.viewerFoundHelpful,
    ).toBe(true);
    expect(
      patchReviewInData(row("b"), "b", (r) => withHelpfulVote(r, true))
        .helpfulCount,
    ).toBe(3);
  });

  it("an unchanged vote leaves the count alone and never goes negative", () => {
    const r = row("a");
    expect(withHelpfulVote(r, false)).toBe(r);
    expect(
      withHelpfulVote(
        { ...r, helpfulCount: 0, viewerFoundHelpful: true },
        false,
      ).helpfulCount,
    ).toBe(0);
  });

  it("removes a blocked reviewer's rows everywhere", () => {
    const data = {
      pages: [{ reviews: [row("a", "u1"), row("b", "u2")] }],
    };
    const next = removeReviewsInData(data, (r) => r.reviewerId === "u2");
    expect(next.pages[0]?.reviews.map((r) => r.id)).toEqual(["a"]);
  });

  it("leaves other data untouched", () => {
    expect(patchReviewInData(null, "a", (r) => r)).toBeNull();
    expect(patchReviewInData({ foo: 1 }, "a", (r) => r)).toEqual({ foo: 1 });
  });
});
