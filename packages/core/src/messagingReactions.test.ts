import type { MessageReactionSummary } from "@abonten/types/messagingType";
import { describe, expect, it } from "vitest";
import {
  isValidReactionEmoji,
  reactionRealtimePatches,
  rollReaction,
} from "./messagingReactions";

const r = (
  emoji: string,
  count: number,
  reacted_by_me = false,
): MessageReactionSummary => ({ emoji, count, reacted_by_me });

describe("rollReaction", () => {
  describe("the caller's own toggle (mine = true)", () => {
    it("adds a first reaction", () => {
      expect(rollReaction([], "👍", true, true)).toEqual([r("👍", 1, true)]);
    });

    it("removes the caller's own reaction, dropping the empty pill", () => {
      expect(rollReaction([r("👍", 1, true)], "👍", false, true)).toEqual([]);
    });

    it("keeps another user's count when the caller removes theirs", () => {
      expect(rollReaction([r("👍", 2, true)], "👍", false, true)).toEqual([
        r("👍", 1, false),
      ]);
    });

    it("joins an emoji someone else already used", () => {
      expect(rollReaction([r("❤️", 1)], "❤️", true, true)).toEqual([
        r("❤️", 2, true),
      ]);
    });

    it("moves the caller's vote off its old emoji when switching", () => {
      // one reaction per user: 👍 was the caller's, ❤️ is someone else's
      expect(
        rollReaction([r("👍", 1, true), r("❤️", 1)], "❤️", true, true),
      ).toEqual([r("❤️", 2, true)]);
    });

    it("is idempotent when re-adding the emoji already held", () => {
      expect(rollReaction([r("👍", 3, true)], "👍", true, true)).toEqual([
        r("👍", 3, true),
      ]);
    });
  });

  describe("another participant's realtime event (mine = false)", () => {
    it("increments without ever claiming the reaction", () => {
      expect(rollReaction([r("👍", 1, true)], "👍", true, false)).toEqual([
        r("👍", 2, true),
      ]);
    });

    it("adds a new emoji as not-mine", () => {
      expect(rollReaction([r("👍", 1, true)], "😂", true, false)).toEqual([
        r("👍", 1, true),
        r("😂", 1, false),
      ]);
    });

    it("does NOT move the caller's own vote off its emoji", () => {
      // regression: treating a remote add as the caller's would silently
      // strip the caller's pill highlight
      const out = rollReaction([r("👍", 1, true)], "❤️", true, false);
      expect(out.find((x) => x.emoji === "👍")).toEqual(r("👍", 1, true));
    });

    it("decrements on a remote remove and keeps the caller's flag", () => {
      expect(rollReaction([r("👍", 2, true)], "👍", false, false)).toEqual([
        r("👍", 1, true),
      ]);
    });

    it("applies a remote emoji switch as remove-then-add", () => {
      const afterRemove = rollReaction([r("👍", 1)], "👍", false, false);
      expect(afterRemove).toEqual([]);
      expect(rollReaction(afterRemove, "😂", true, false)).toEqual([
        r("😂", 1, false),
      ]);
    });
  });

  it("orders by count and keeps ties in their existing order", () => {
    // stable sort: no locale dependence, and pills don't reshuffle
    const out = rollReaction([r("😂", 1), r("❤️", 1)], "👍", true, false);
    expect(out.map((x) => x.emoji)).toEqual(["😂", "❤️", "👍"]);
    expect(out[2]).toEqual(r("👍", 1, false));

    const promoted = rollReaction([r("😂", 1), r("❤️", 1)], "❤️", true, false);
    expect(promoted.map((x) => x.emoji)).toEqual(["❤️", "😂"]);
  });

  it("never emits a zero or negative count", () => {
    expect(rollReaction([r("👍", 1)], "👍", false, false)).toEqual([]);
    expect(rollReaction([], "👍", false, true)).toEqual([]);
  });
});

describe("reactionRealtimePatches", () => {
  const ME = "user-me";
  const THEM = "user-them";
  const MSG = "msg-1";

  it("INSERT from another user adds that emoji", () => {
    expect(
      reactionRealtimePatches(
        {
          eventType: "INSERT",
          new: { message_id: MSG, user_id: THEM, emoji: "👍" },
        },
        ME,
      ),
    ).toEqual([{ messageId: MSG, emoji: "👍", added: true }]);
  });

  it("DELETE from another user removes that emoji (reads old)", () => {
    expect(
      reactionRealtimePatches(
        {
          eventType: "DELETE",
          old: { message_id: MSG, user_id: THEM, emoji: "❤️" },
        },
        ME,
      ),
    ).toEqual([{ messageId: MSG, emoji: "❤️", added: false }]);
  });

  it("UPDATE (emoji switch) becomes remove-then-add, in order", () => {
    expect(
      reactionRealtimePatches(
        {
          eventType: "UPDATE",
          old: { message_id: MSG, user_id: THEM, emoji: "👍" },
          new: { message_id: MSG, user_id: THEM, emoji: "😂" },
        },
        ME,
      ),
    ).toEqual([
      { messageId: MSG, emoji: "👍", added: false },
      { messageId: MSG, emoji: "😂", added: true },
    ]);
  });

  it("UPDATE that did not change the emoji is a single add (idempotent)", () => {
    expect(
      reactionRealtimePatches(
        {
          eventType: "UPDATE",
          old: { message_id: MSG, user_id: THEM, emoji: "👍" },
          new: { message_id: MSG, user_id: THEM, emoji: "👍" },
        },
        ME,
      ),
    ).toEqual([{ messageId: MSG, emoji: "👍", added: true }]);
  });

  describe("own-event suppression", () => {
    it("ignores this user's own INSERT echo", () => {
      expect(
        reactionRealtimePatches(
          {
            eventType: "INSERT",
            new: { message_id: MSG, user_id: ME, emoji: "👍" },
          },
          ME,
        ),
      ).toEqual([]);
    });

    it("ignores this user's own DELETE echo", () => {
      expect(
        reactionRealtimePatches(
          {
            eventType: "DELETE",
            old: { message_id: MSG, user_id: ME, emoji: "👍" },
          },
          ME,
        ),
      ).toEqual([]);
    });

    it("still applies another user's event when we have no identity", () => {
      expect(
        reactionRealtimePatches(
          {
            eventType: "INSERT",
            new: { message_id: MSG, user_id: THEM, emoji: "🙏" },
          },
          null,
        ),
      ).toEqual([{ messageId: MSG, emoji: "🙏", added: true }]);
    });
  });

  describe("malformed payloads are no-ops, never throws", () => {
    for (const [label, payload] of [
      ["empty object", {}],
      [
        "no message id",
        { eventType: "INSERT", new: { user_id: THEM, emoji: "👍" } },
      ],
      [
        "no actor",
        { eventType: "INSERT", new: { message_id: MSG, emoji: "👍" } },
      ],
      [
        "no emoji",
        { eventType: "INSERT", new: { message_id: MSG, user_id: THEM } },
      ],
      [
        "empty emoji",
        {
          eventType: "INSERT",
          new: { message_id: MSG, user_id: THEM, emoji: "" },
        },
      ],
      ["null new/old", { eventType: "INSERT", new: null, old: null }],
      [
        "unknown event type",
        {
          eventType: "TRUNCATE",
          new: { message_id: MSG, user_id: THEM, emoji: "👍" },
        },
      ],
      [
        "missing event type",
        { new: { message_id: MSG, user_id: THEM, emoji: "👍" } },
      ],
    ] as const) {
      it(label, () => {
        expect(reactionRealtimePatches(payload as never, ME)).toEqual([]);
      });
    }

    it("a DELETE whose old emoji is missing is a no-op", () => {
      expect(
        reactionRealtimePatches(
          { eventType: "DELETE", old: { message_id: MSG, user_id: THEM } },
          ME,
        ),
      ).toEqual([]);
    });
  });

  it("falls back to old.message_id when new lacks it", () => {
    expect(
      reactionRealtimePatches(
        {
          eventType: "DELETE",
          old: { message_id: MSG, user_id: THEM, emoji: "😮" },
          new: {},
        },
        ME,
      ),
    ).toEqual([{ messageId: MSG, emoji: "😮", added: false }]);
  });
});

describe("isValidReactionEmoji", () => {
  describe("accepts real emoji", () => {
    for (const [label, emoji] of [
      ["simple", "\u{1F680}"],
      ["from the default palette", "\u{1F44D}"],
      ["ZWJ family sequence", "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}"],
      ["skin-tone modifier", "\u{1F44D}\u{1F3FE}"],
      ["keycap (contains an ASCII digit)", "1\uFE0F\u20E3"],
      ["regional-indicator flag", "\u{1F1EC}\u{1F1ED}"],
      ["variation selector", "\u2764\uFE0F"],
    ] as const) {
      it(label, () => expect(isValidReactionEmoji(emoji)).toBe(true));
    }
  });

  describe("rejects anything that could carry readable text", () => {
    for (const [label, value] of [
      ["plain word", "SPAM"],
      ["lowercase word", "lol"],
      ["a URL", "http://x.co"],
      ["digits only", "12345"],
      ["punctuation only", "!!!!"],
      ["ascii emoticon", "<3"],
      ["emoji with letters appended", "\u{1F680}go"],
      ["two emoji separated by a space", "\u{1F680} \u{1F680}"],
      ["emoji with a newline", "\u{1F680}\n"],
      ["latin-1 accented letter", "\u00e9"],
      ["empty string", ""],
    ] as const) {
      it(label, () => expect(isValidReactionEmoji(value)).toBe(false));
    }
  });

  it("enforces the length ceiling", () => {
    expect(isValidReactionEmoji("\u{1F680}".repeat(8))).toBe(true); // 16 units
    expect(isValidReactionEmoji("\u{1F680}".repeat(9))).toBe(false); // 18 units
  });
});
