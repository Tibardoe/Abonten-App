import type { ConversationListItem } from "@abonten/types/messagingType";
import { describe, expect, it } from "vitest";
import {
  type ConversationListCache,
  markConversationReadInPages,
  markConversationUnreadInPages,
  patchConversationInPages,
  removeConversationFromPages,
  unreadCountInPages,
} from "./messagingInboxCache";

function row(id: string, over: Partial<ConversationListItem> = {}) {
  return {
    conversation_id: id,
    type: "event",
    event_id: null,
    place_id: null,
    title: null,
    status: "open",
    last_message_at: "2026-09-07T10:00:00.000Z",
    last_message_preview: "hi",
    last_message_sender_id: "other",
    my_role: "member",
    my_last_read_at: "2026-09-07T09:00:00.000Z",
    muted: false,
    archived: false,
    unread_count: 3,
    other_participant_ids: [],
    created_at: "2026-09-01T00:00:00.000Z",
    subject_title: null,
    other_user_id: null,
    other_display_name: null,
    other_username: null,
    other_avatar_public_id: null,
    other_avatar_version: null,
    ...over,
  } as ConversationListItem;
}

function cache(...rows: ConversationListItem[]): ConversationListCache {
  return { pages: [{ data: rows }], pageParams: [null] };
}

describe("messagingInboxCache", () => {
  it("clears unread and advances the read marker", () => {
    const before = cache(row("a"), row("b"));
    const after = markConversationReadInPages(
      before,
      "a",
      "2026-09-07T11:00:00.000Z",
    );
    expect(after?.pages[0].data[0].unread_count).toBe(0);
    expect(after?.pages[0].data[0].my_last_read_at).toBe(
      "2026-09-07T11:00:00.000Z",
    );
    // untouched row keeps its identity, so its row component never re-renders
    expect(after?.pages[0].data[1]).toBe(before.pages[0].data[1]);
  });

  it("never moves the read marker backwards", () => {
    const before = cache(
      row("a", {
        unread_count: 0,
        my_last_read_at: "2026-09-07T12:00:00.000Z",
      }),
    );
    const after = markConversationReadInPages(
      before,
      "a",
      "2026-09-07T11:00:00.000Z",
    );
    // already read further ahead -> identical reference, no re-render
    expect(after).toBe(before);
  });

  it("returns the identical cache when the row is not loaded in this view", () => {
    const before = cache(row("a"));
    expect(
      markConversationReadInPages(before, "zzz", "2026-09-07T11:00:00.000Z"),
    ).toBe(before);
    expect(patchConversationInPages(before, "zzz", { muted: true })).toBe(
      before,
    );
    expect(removeConversationFromPages(before, "zzz")).toBe(before);
  });

  it("reads the current unread count for badge arithmetic", () => {
    const before = cache(row("a", { unread_count: 4 }), row("b"));
    expect(unreadCountInPages(before, "a")).toBe(4);
    expect(unreadCountInPages(before, "missing")).toBeNull();
  });

  it("patches mute/archive in place", () => {
    const before = cache(row("a"));
    const after = patchConversationInPages(before, "a", { muted: true });
    expect(after?.pages[0].data[0].muted).toBe(true);
    expect(after).not.toBe(before);
  });

  it("marks a read conversation unread again", () => {
    const before = cache(row("a", { unread_count: 0 }));
    expect(
      markConversationUnreadInPages(before, "a")?.pages[0].data[0].unread_count,
    ).toBe(1);
  });

  it("removes an archived row from the active list", () => {
    const before = cache(row("a"), row("b"));
    const after = removeConversationFromPages(before, "a");
    expect(after?.pages[0].data.map((r) => r.conversation_id)).toEqual(["b"]);
  });

  it("handles an undefined cache", () => {
    expect(markConversationReadInPages(undefined, "a", "x")).toBeUndefined();
    expect(unreadCountInPages(undefined, "a")).toBeNull();
  });
});

describe("bumpConversationInPages", () => {
  it("moves a bumped conversation to the top and applies the preview", async () => {
    const { bumpConversationInPages } = await import("./messagingInboxCache");
    const before = cache(row("a"), row("b", { unread_count: 0 }));
    const after = bumpConversationInPages(
      before,
      "b",
      {
        last_message_at: "2026-09-07T12:00:00.000Z",
        last_message_preview: "new one",
        last_message_sender_id: "other",
      },
      1,
    );
    expect(after?.pages[0].data.map((r) => r.conversation_id)).toEqual([
      "b",
      "a",
    ]);
    expect(after?.pages[0].data[0].last_message_preview).toBe("new one");
    expect(after?.pages[0].data[0].unread_count).toBe(1);
  });

  it("does not synthesise a conversation the view has not loaded", async () => {
    const { bumpConversationInPages } = await import("./messagingInboxCache");
    const before = cache(row("a"));
    const after = bumpConversationInPages(before, "unloaded", {
      last_message_at: "x",
      last_message_preview: "y",
      last_message_sender_id: "z",
    });
    expect(after).toBe(before);
  });

  it("is a no-op when the row is already first and nothing changed", async () => {
    const { bumpConversationInPages } = await import("./messagingInboxCache");
    const before = cache(row("a", { unread_count: 0 }));
    const after = bumpConversationInPages(before, "a", {
      last_message_at: before.pages[0].data[0].last_message_at,
      last_message_preview: before.pages[0].data[0].last_message_preview,
      last_message_sender_id: before.pages[0].data[0].last_message_sender_id,
    });
    expect(after).toBe(before);
  });
});

describe("conversationPreviewFor", () => {
  it("mirrors the server's preview rule", async () => {
    const { conversationPreviewFor } = await import("./messagingInboxCache");
    expect(
      conversationPreviewFor({ content: "hello", message_type: "text" }),
    ).toBe("hello");
    expect(
      conversationPreviewFor({ content: null, message_type: "image" }),
    ).toBe("[Photo]");
    expect(
      conversationPreviewFor({ content: null, message_type: "file" }),
    ).toBe("[Attachment]");
    expect(
      conversationPreviewFor({
        content: "x".repeat(200),
        message_type: "text",
      }),
    ).toHaveLength(140);
  });
});
