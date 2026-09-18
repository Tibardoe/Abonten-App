import { describe, expect, it } from "vitest";
import {
  channelNeedsRejoin,
  conversationChannelName,
  inboxUpdateEffect,
  openPrivateChannel,
  presenceRecency,
  userInboxChannelName,
} from "./messagingRealtime";

type FakeChannel = { topic: string; config: unknown };

// A stand-in for supabase-js's channel registry: channel() hands back the
// existing channel for a registered topic, and removal only completes after
// an async round trip -- the two behaviours openPrivateChannel exists for.
function fakeClient() {
  const channels: FakeChannel[] = [];
  const removed: FakeChannel[] = [];
  return {
    channels,
    removed,
    getChannels: () => [...channels],
    removeChannel: async (c: FakeChannel) => {
      await new Promise((r) => setTimeout(r, 5));
      removed.push(c);
      channels.splice(channels.indexOf(c), 1);
      return "ok";
    },
    channel: (topic: string, opts: { config: unknown }) => {
      const full = `realtime:${topic}`;
      const existing = channels.find((c) => c.topic === full);
      if (existing) return existing;
      const created = { topic: full, config: opts.config };
      channels.push(created);
      return created;
    },
  };
}

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

  it("openPrivateChannel removes a stale channel before creating a fresh private one", async () => {
    const client = fakeClient();
    const stale = client.channel("conversation:c1", { config: {} });
    const other = client.channel("conversation:c2", { config: {} });

    const fresh = await openPrivateChannel(
      client,
      "conversation:c1",
      () => false,
    );

    expect(fresh).not.toBe(stale);
    expect(fresh?.config).toEqual({
      private: true,
      broadcast: { self: false },
    });
    expect(client.removed).toEqual([stale]);
    expect(client.channels).toContain(other);
  });

  it("openPrivateChannel creates nothing once the caller was cancelled", async () => {
    const client = fakeClient();
    client.channel("inbox:u1", { config: {} });
    let cancelled = false;
    const pending = openPrivateChannel(client, "inbox:u1", () => cancelled);
    cancelled = true;
    expect(await pending).toBeNull();
    expect(client.channels).toHaveLength(0);
  });

  it("counts only a new message from someone else in a thread that is not open", () => {
    const base = { id: "c1", last_message_sender_id: "them" };
    expect(inboxUpdateEffect({ ...base, advanced: true }, "me", null)).toEqual({
      unreadDelta: 1,
      reconcile: false,
    });
    // Own message, and a message in the open thread: no unread.
    expect(
      inboxUpdateEffect(
        { ...base, last_message_sender_id: "me", advanced: true },
        "me",
        null,
      ).unreadDelta,
    ).toBe(0);
    expect(
      inboxUpdateEffect({ ...base, advanced: true }, "me", "c1").unreadDelta,
    ).toBe(0);
  });

  it("never counts a rollback as unread, and asks for a refetch", () => {
    expect(
      inboxUpdateEffect(
        { id: "c1", last_message_sender_id: "them", advanced: false },
        "me",
        null,
      ),
    ).toEqual({ unreadDelta: 0, reconcile: true });
  });

  it("treats an event without the flag as a new message (older payloads)", () => {
    expect(
      inboxUpdateEffect(
        { id: "c1", last_message_sender_id: "them" },
        "me",
        null,
      ),
    ).toEqual({ unreadDelta: 1, reconcile: false });
  });

  it("rejoins only a channel that is neither joined nor joining", () => {
    expect(channelNeedsRejoin("joined")).toBe(false);
    expect(channelNeedsRejoin("joining")).toBe(false);
    for (const s of ["errored", "closed", "leaving", null, undefined]) {
      expect(channelNeedsRejoin(s)).toBe(true);
    }
  });
});
