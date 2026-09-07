import { describe, expect, it } from "vitest";
import {
  conversationChannelName,
  presenceRecency,
  userInboxChannelName,
} from "./messagingRealtime";

describe("messagingRealtime contract", () => {
  it("builds stable channel names", () => {
    expect(conversationChannelName("abc-123")).toBe("conversation:abc-123");
    expect(userInboxChannelName("u-9")).toBe("inbox:u-9");
  });

  it("buckets presence recency from a last-seen timestamp", () => {
    const now = 1_000_000_000_000;
    expect(presenceRecency(null, now)).toBe("offline");
    expect(presenceRecency(now - 10_000, now)).toBe("online");
    expect(presenceRecency(now - 5 * 60_000, now)).toBe("recently_active");
    expect(presenceRecency(now - 60 * 60_000, now)).toBe("offline");
    // boundaries
    expect(presenceRecency(now - 60_000, now)).toBe("online");
    expect(presenceRecency(now - 15 * 60_000, now)).toBe("recently_active");
  });
});
