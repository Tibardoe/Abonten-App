import { describe, expect, it } from "vitest";
import {
  EMPTY_REVIEW_SUMMARY,
  type ReviewListRpcRow,
  emptyReviewsMessage,
  formatReviewCount,
  parseReviewRow,
  parseReviewSummary,
  parseSharedReviewId,
  ratingShares,
  reviewByIdArgs,
  reviewListArgs,
  reviewerDisplayName,
  reviewsPath,
  toReviewPage,
} from "./reviewList";

function rpcRow(over: Partial<ReviewListRpcRow> = {}): ReviewListRpcRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    subject_id: "22222222-2222-4222-8222-222222222222",
    reviewer_id: "33333333-3333-4333-8333-333333333333",
    rating: 4,
    title: "Good",
    comment: "Nice",
    created_at: "2026-09-20T10:00:00Z",
    edited_at: null,
    helpful_count: 3,
    viewer_found_helpful: true,
    is_verified_attendee: true,
    response: null,
    response_at: null,
    reviewer_username: "ama",
    reviewer_full_name: "Ama K",
    reviewer_avatar_public_id: "a/b",
    reviewer_avatar_version: "1",
    reviewer_deleted: false,
    photos: [
      { id: "p2", public_id: "x/2", version: "1", position: 1 },
      { id: "p1", public_id: "x/1", version: "1", position: 0 },
      { bogus: true },
    ],
    ...over,
  };
}

describe("parseReviewRow", () => {
  it("maps the row and orders photos, dropping malformed ones", () => {
    const r = parseReviewRow(rpcRow());
    expect(r.helpfulCount).toBe(3);
    expect(r.viewerFoundHelpful).toBe(true);
    expect(r.photos.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(r.reviewer.username).toBe("ama");
  });

  it("hides a deleted reviewer's identity", () => {
    const r = parseReviewRow(rpcRow({ reviewer_deleted: true }));
    expect(r.reviewer).toMatchObject({
      username: null,
      fullName: null,
      avatarPublicId: null,
      deleted: true,
    });
    expect(reviewerDisplayName(r.reviewer, "event")).toBe(
      "Former Abonten member",
    );
  });

  it("falls back to a neutral name per subject kind", () => {
    const r = parseReviewRow(rpcRow({ reviewer_username: null }));
    expect(reviewerDisplayName(r.reviewer, "event")).toBe("Attendee");
    expect(reviewerDisplayName(r.reviewer, "place")).toBe("Guest");
  });
});

describe("paging", () => {
  it("asks for one extra row and turns it into a cursor", () => {
    const args = reviewListArgs({
      kind: "place",
      subjectId: "s",
      limit: 2,
    });
    expect(args.p_limit).toBe(3);
    expect(args.p_rating).toBeNull();
    expect(args.p_after_id).toBeNull();
    expect(args.p_sort).toBe("helpful");

    const rows = [
      rpcRow({ id: "a", helpful_count: 5 }),
      rpcRow({ id: "b", helpful_count: 2, created_at: "2026-09-19T00:00:00Z" }),
      rpcRow({ id: "c" }),
    ];
    const page = toReviewPage(rows, 2);
    expect(page.reviews.map((r) => r.id)).toEqual(["a", "b"]);
    expect(page.nextCursor).toEqual({
      helpful: 2,
      createdAt: "2026-09-19T00:00:00Z",
      id: "b",
    });
    expect(toReviewPage(rows.slice(0, 2), 2).nextCursor).toBeNull();
  });

  it("passes the cursor and filter through as explicit values", () => {
    const args = reviewListArgs({
      kind: "event",
      subjectId: "s",
      rating: 5,
      sort: "recent",
      cursor: { helpful: 0, createdAt: "t", id: "i" },
    });
    expect(args).toMatchObject({
      p_rating: 5,
      p_sort: "recent",
      p_after_helpful: 0,
      p_after_created: "t",
      p_after_id: "i",
    });
    expect(reviewByIdArgs("event", "s", "r")).toMatchObject({
      p_review_id: "r",
      p_limit: 1,
    });
  });
});

describe("summary", () => {
  it("parses numeric strings and defaults missing rows", () => {
    expect(parseReviewSummary(null)).toEqual(EMPTY_REVIEW_SUMMARY);
    const s = parseReviewSummary({
      average_rating: "4.25",
      total_ratings: 4,
      count_1: 0,
      count_2: 0,
      count_3: 1,
      count_4: 1,
      count_5: 2,
    });
    expect(s.average).toBe(4.25);
    expect(s.counts[5]).toBe(2);
  });

  it("rating shares always add up to 100", () => {
    const s = parseReviewSummary({
      average_rating: 3,
      total_ratings: 3,
      count_1: 1,
      count_2: 0,
      count_3: 1,
      count_4: 0,
      count_5: 1,
    });
    const shares = ratingShares(s);
    expect(shares[1] + shares[2] + shares[3] + shares[4] + shares[5]).toBe(100);
    expect(ratingShares(EMPTY_REVIEW_SUMMARY)[5]).toBe(0);
  });
});

describe("copy and links", () => {
  it("counts and empty states", () => {
    expect(formatReviewCount(1)).toBe("1 review");
    expect(formatReviewCount(1234)).toBe("1,234 reviews");
    expect(emptyReviewsMessage(1, "place").title).toBe("No 1-star reviews yet");
    expect(emptyReviewsMessage(null, "event").title).toBe("No reviews yet");
  });

  it("builds review links and only accepts ids from ?review=", () => {
    expect(reviewsPath("event", "abc123")).toBe("/events/abc123/reviews");
    const id = "11111111-1111-4111-8111-111111111111";
    expect(reviewsPath("place", "osu-lounge", id)).toBe(
      `/places/osu-lounge/reviews?review=${id}`,
    );
    expect(parseSharedReviewId(id)).toBe(id);
    expect(parseSharedReviewId("x' or 1=1")).toBeNull();
    expect(parseSharedReviewId([id])).toBe(id);
    expect(parseSharedReviewId(undefined)).toBeNull();
  });
});
