import type { ContentPostDocument } from "@abonten/types/contentType";
import { describe, expect, it } from "vitest";
import {
  formatMinor,
  projectedSpentMinor,
  refundableMinor,
} from "./campaignMoney";
import {
  campaignActionNeedsReason,
  canTransitionCampaign,
} from "./campaignStateMachine";
import { contentCtaLabel } from "./copy";
import { mergeSponsored } from "./feedMerge";
import { collectHashtags, normalizeHashtag } from "./hashtags";
import { formatStoryAge, isStoryActive, storyRemainingMs } from "./storyExpiry";
import { viewEventsFor } from "./viewTracking";

function post(id: string): ContentPostDocument {
  return {
    id,
    kind: "spotlight",
    authorId: "a",
    caption: null,
    hashtags: [],
    category: null,
    status: "published",
    moderationState: "visible",
    publishedAt: "2026-09-16T00:00:00Z",
    expiresAt: null,
    allowComments: true,
    allowDownload: false,
    counts: {
      likes: 0,
      reactions: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      views: 0,
    },
    location: null,
    media: [],
    publisher: {
      kind: "organizer",
      id: "a",
      name: "A",
      avatarPublicId: null,
      avatarVersion: null,
      verified: false,
    },
    event: null,
    place: null,
    viewer: {
      liked: false,
      saved: false,
      reaction: null,
      following: false,
      seen: false,
      isAuthor: false,
      notInterested: false,
    },
  };
}

describe("story expiry", () => {
  const now = new Date("2026-09-16T12:00:00Z");
  it("is active only between publish and expiry", () => {
    expect(
      isStoryActive(
        {
          publishedAt: "2026-09-16T00:00:00Z",
          expiresAt: "2026-09-17T00:00:00Z",
        },
        now,
      ),
    ).toBe(true);
    expect(
      isStoryActive(
        {
          publishedAt: "2026-09-16T00:00:00Z",
          expiresAt: "2026-09-16T11:59:59Z",
        },
        now,
      ),
    ).toBe(false);
    expect(isStoryActive({ publishedAt: null, expiresAt: null }, now)).toBe(
      false,
    );
  });
  it("counts remaining time and formats age", () => {
    expect(storyRemainingMs("2026-09-16T13:00:00Z", now)).toBe(3_600_000);
    expect(storyRemainingMs("2026-09-16T11:00:00Z", now)).toBe(0);
    expect(formatStoryAge("2026-09-16T11:15:00Z", now)).toBe("45m");
    expect(formatStoryAge("2026-09-16T09:00:00Z", now)).toBe("3h");
    expect(formatStoryAge("2026-09-13T09:00:00Z", now)).toBe("3d");
  });
});

describe("hashtags", () => {
  it("normalises and de-duplicates", () => {
    expect(normalizeHashtag("#Accra")).toBe("accra");
    expect(normalizeHashtag("bad tag")).toBeNull();
    expect(collectHashtags("Live #Jazz tonight #jazz #Osu", ["Accra"])).toEqual(
      ["accra", "jazz", "osu"],
    );
  });
  it("caps at fifteen", () => {
    const caption = Array.from({ length: 20 }, (_, i) => `#t${i}`).join(" ");
    expect(collectHashtags(caption)).toHaveLength(15);
  });
});

describe("sponsored merge", () => {
  const organic = Array.from({ length: 10 }, (_, i) => post(`o${i}`));
  const sponsored = [
    { campaignId: "c1", post: post("s1") },
    { campaignId: "c2", post: post("s2") },
    { campaignId: "c3", post: post("s3") },
  ];
  it("keeps the share and the gap", () => {
    const merged = mergeSponsored(organic, sponsored, {
      maxShareBps: 2000,
      minGap: 4,
    });
    const flags = merged.map((m) => (m.sponsored ? "S" : "o")).join("");
    expect(flags).toBe("ooooSooooSoo");
    expect(merged.filter((m) => m.sponsored).length).toBe(2);
  });
  it("never duplicates an organic post and never exceeds the share", () => {
    const merged = mergeSponsored(
      organic,
      [{ campaignId: "c", post: post("o1") }],
      { maxShareBps: 2000, minGap: 1 },
    );
    expect(merged.every((m) => !m.sponsored)).toBe(true);
    expect(
      mergeSponsored(organic, sponsored, { maxShareBps: 0, minGap: 1 }).every(
        (m) => !m.sponsored,
      ),
    ).toBe(true);
  });
  it("is deterministic", () => {
    const a = mergeSponsored(organic, sponsored, {
      maxShareBps: 3000,
      minGap: 2,
    });
    const b = mergeSponsored(organic, sponsored, {
      maxShareBps: 3000,
      minGap: 2,
    });
    expect(a.map((m) => m.post.id)).toEqual(b.map((m) => m.post.id));
  });
});

describe("campaign state machine", () => {
  it("allows only the documented moves", () => {
    expect(canTransitionCampaign("pending_review", "active", "admin")).toBe(
      true,
    );
    expect(
      canTransitionCampaign("pending_review", "active", "advertiser"),
    ).toBe(false);
    expect(canTransitionCampaign("active", "paused", "advertiser")).toBe(true);
    expect(canTransitionCampaign("completed", "active", "admin")).toBe(false);
    expect(canTransitionCampaign("cancelled", "refunded", "admin")).toBe(true);
    expect(canTransitionCampaign("draft", "active", "system")).toBe(false);
  });
  it("needs reasons for rejections, pauses and cancellations", () => {
    expect(campaignActionNeedsReason("rejected")).toBe(true);
    expect(campaignActionNeedsReason("active")).toBe(false);
  });
});

describe("campaign money", () => {
  it("accrues pro rata and caps at paid", () => {
    expect(
      projectedSpentMinor({
        paidMinor: 5000,
        activeSeconds: 0,
        durationDays: 3,
      }),
    ).toBe(0);
    expect(
      projectedSpentMinor({
        paidMinor: 5000,
        activeSeconds: 86_400 * 1.5,
        durationDays: 3,
      }),
    ).toBe(2500);
    expect(
      projectedSpentMinor({
        paidMinor: 5000,
        activeSeconds: 86_400 * 9,
        durationDays: 3,
      }),
    ).toBe(5000);
  });
  it("refunds only the unspent remainder of a finished campaign", () => {
    expect(
      refundableMinor({
        status: "active",
        paidMinor: 5000,
        spentMinor: 1000,
        refundedMinor: 0,
      }),
    ).toBe(0);
    expect(
      refundableMinor({
        status: "cancelled",
        paidMinor: 5000,
        spentMinor: 1000,
        refundedMinor: 0,
      }),
    ).toBe(4000);
    expect(
      refundableMinor({
        status: "cancelled",
        paidMinor: 5000,
        spentMinor: 1000,
        refundedMinor: 4000,
      }),
    ).toBe(0);
    expect(formatMinor(5000)).toBe("GH₵ 50.00");
  });
});

describe("view tracking", () => {
  it("reports what a session earned", () => {
    expect(
      viewEventsFor({
        watchedMs: 0,
        durationMs: 10_000,
        loops: 0,
        reachedEnd: false,
      }),
    ).toEqual([]);
    expect(
      viewEventsFor({
        watchedMs: 1500,
        durationMs: 10_000,
        loops: 0,
        reachedEnd: false,
      }),
    ).toEqual(["view_start"]);
    expect(
      viewEventsFor({
        watchedMs: 9600,
        durationMs: 10_000,
        loops: 0,
        reachedEnd: false,
      }),
    ).toEqual(["view_start", "meaningful_view", "completion"]);
    expect(
      viewEventsFor({
        watchedMs: 25_000,
        durationMs: 10_000,
        loops: 2,
        reachedEnd: true,
      }),
    ).toEqual(["view_start", "meaningful_view", "completion", "replay"]);
    expect(
      viewEventsFor({
        watchedMs: 5000,
        durationMs: null,
        loops: 0,
        reachedEnd: false,
      }),
    ).toContain("completion");
  });
});

describe("cta", () => {
  it("never shows a stale ticket call to action", () => {
    const base = post("x");
    expect(
      contentCtaLabel({
        ...base,
        event: {
          available: false,
          status: "published",
          archived: false,
        },
      }),
    ).toEqual({ label: "Event has ended", target: null });
    expect(
      contentCtaLabel({
        ...base,
        event: { available: true, status: "canceled", archived: false },
      }),
    ).toEqual({ label: "Event cancelled", target: null });
    expect(contentCtaLabel({ ...base, place: null, event: null })).toEqual({
      label: "View profile",
      target: "profile",
    });
  });
});
