import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Exercises the in-app messaging layer end to end against a real local
// Postgres, the same way the ticketing suites do — not by reading the SQL:
//
//   supabase/migrations/20260907090000_messaging_schema.sql   (tables + RLS)
//   supabase/migrations/20260907090100_messaging_rpcs.sql     (write RPCs)
//
// The security model under test: conversation / conversation_participant /
// message have NO client write grants, every mutation is a SECURITY DEFINER
// RPC keyed on auth.uid(), and row visibility is "are you a participant"
// (public.is_conversation_participant). These tests prove a non-participant
// can neither read nor write another user's conversation, that get-or-create
// is race-safe, that optimistic sends dedupe, and that block / unread /
// edit-window rules actually hold.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

type Rpc = Database["public"]["Functions"];

// The generated Args types mark every SQL param required even when the
// function body gives it a DEFAULT (documented in setupClient.ts). Cast at
// the call site, same as the ticketing suites.
function rpcArgs<K extends keyof Rpc>(
  args: Partial<Rpc[K]["Args"]>,
): Rpc[K]["Args"] {
  return args as Rpc[K]["Args"];
}

async function createTestPlace(
  service: SupabaseClient<Database>,
  ownerId: string,
): Promise<string> {
  const { data: category } = await service
    .from("place_category")
    .select("id")
    .limit(1)
    .single();

  const { data, error } = await service
    .from("place")
    .insert({
      owner_id: ownerId,
      name: "Integration Test Place",
      slug: `integration-test-place-${crypto.randomUUID()}`,
      description: "Created by the messaging integration suite.",
      category_id: category?.id as number,
      location: "POINT(-0.187 5.6037)",
      address: { city: "Accra", country: "Ghana" },
      cover_public_id: "test/cover",
      cover_version: "1",
      status: "published",
    } as never)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create test place: ${error?.message}`);
  }
  return (data as { id: string }).id;
}

describe("messaging: conversations, RLS, and write RPCs", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let eventId: string;

  beforeEach(async () => {
    service = getServiceClient();
    organizer = await createTestUser(service);
    member = await createTestUser(service);
    outsider = await createTestUser(service);

    const fixture = await createTestEventWithTicketType(service, organizer.id, {
      quantity: 10,
      price: 50,
    });
    eventId = fixture.eventId;
  });

  afterEach(async () => {
    await deleteTestEvent(service, eventId);
    await deleteTestUser(service, organizer.id);
    await deleteTestUser(service, member.id);
    await deleteTestUser(service, outsider.id);
  });

  async function openEventConversation(user: TestUser): Promise<string> {
    const { data, error } = await user.client.rpc(
      "open_conversation",
      rpcArgs<"open_conversation">({ p_type: "event", p_event_id: eventId }),
    );
    if (error) throw new Error(`open_conversation failed: ${error.message}`);
    return data as string;
  }

  it("open_conversation creates the thread, both participants, and a system message", async () => {
    const conversationId = await openEventConversation(member);
    expect(conversationId).toBeTruthy();

    const { data: participants } = await service
      .from("conversation_participant")
      .select("user_id, role")
      .eq("conversation_id", conversationId);

    const byUser = Object.fromEntries(
      (participants ?? []).map((p) => [p.user_id, p.role]),
    );
    expect(byUser[member.id]).toBe("member");
    expect(byUser[organizer.id]).toBe("organizer");

    const { data: messages } = await service
      .from("message")
      .select("message_type, system_event")
      .eq("conversation_id", conversationId);
    expect(messages).toHaveLength(1);
    expect(messages?.[0].message_type).toBe("system");
    expect(messages?.[0].system_event).toBe("conversation_started");
  });

  it("open_conversation is idempotent — tapping Chat again returns the same id", async () => {
    const first = await openEventConversation(member);
    const second = await openEventConversation(member);
    expect(second).toBe(first);

    const { count } = await service
      .from("conversation")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("created_by", member.id);
    expect(count).toBe(1);
  });

  it("open_conversation is race-safe under concurrent first calls", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => openEventConversation(member)),
    );
    expect(new Set(results).size).toBe(1);

    const { count } = await service
      .from("conversation")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("created_by", member.id);
    expect(count).toBe(1);
  });

  it("rejects starting a conversation with your own event", async () => {
    const { error } = await organizer.client.rpc(
      "open_conversation",
      rpcArgs<"open_conversation">({ p_type: "event", p_event_id: eventId }),
    );
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/your own event/i);
  });

  it("open_conversation works for a place and dedupes the same way", async () => {
    const placeId = await createTestPlace(service, organizer.id);
    try {
      const first = await member.client.rpc(
        "open_conversation",
        rpcArgs<"open_conversation">({ p_type: "place", p_place_id: placeId }),
      );
      const second = await member.client.rpc(
        "open_conversation",
        rpcArgs<"open_conversation">({ p_type: "place", p_place_id: placeId }),
      );
      expect(first.error).toBeNull();
      expect(second.data).toBe(first.data);
    } finally {
      await service.from("place").delete().eq("id", placeId);
    }
  });

  it("a non-participant cannot read the conversation or its messages (RLS / IDOR)", async () => {
    const conversationId = await openEventConversation(member);
    await member.client.rpc(
      "send_message",
      rpcArgs<"send_message">({
        p_conversation_id: conversationId,
        p_content: "Are tickets still available?",
      }),
    );

    const { data: convRows } = await outsider.client
      .from("conversation")
      .select("id")
      .eq("id", conversationId);
    expect(convRows ?? []).toHaveLength(0);

    const { data: msgRows } = await outsider.client
      .from("message")
      .select("id")
      .eq("conversation_id", conversationId);
    expect(msgRows ?? []).toHaveLength(0);

    // Both real participants can read it.
    const { data: memberView } = await member.client
      .from("message")
      .select("id")
      .eq("conversation_id", conversationId);
    expect((memberView ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("a non-participant cannot send into the conversation", async () => {
    const conversationId = await openEventConversation(member);
    const { error } = await outsider.client.rpc(
      "send_message",
      rpcArgs<"send_message">({
        p_conversation_id: conversationId,
        p_content: "let me in",
      }),
    );
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/not authorized/i);
  });

  it("optimistic sends dedupe on client_generated_id", async () => {
    const conversationId = await openEventConversation(member);
    const clientId = crypto.randomUUID();

    const send = () =>
      member.client.rpc(
        "send_message",
        rpcArgs<"send_message">({
          p_conversation_id: conversationId,
          p_content: "hello",
          p_client_generated_id: clientId,
        }),
      );

    const a = await send();
    const b = await send();
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    expect(b.data).toBe(a.data);

    const { count } = await service
      .from("message")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("client_generated_id", clientId);
    expect(count).toBe(1);
  });

  it("unread counts track last_read_at and clear on mark_conversation_read", async () => {
    const conversationId = await openEventConversation(member);
    await member.client.rpc(
      "send_message",
      rpcArgs<"send_message">({
        p_conversation_id: conversationId,
        p_content: "first question",
      }),
    );
    await member.client.rpc(
      "send_message",
      rpcArgs<"send_message">({
        p_conversation_id: conversationId,
        p_content: "second question",
      }),
    );

    // Organizer sees 2 unread; the sender sees 0 of their own.
    const organizerList = await organizer.client.rpc(
      "list_conversations",
      rpcArgs<"list_conversations">({ p_filter: "all" }),
    );
    const orgRow = (organizerList.data ?? []).find(
      (r) => r.conversation_id === conversationId,
    );
    expect(orgRow?.unread_count).toBe(2);

    const memberCount = await member.client.rpc(
      "get_unread_conversation_count",
    );
    expect(memberCount.data).toBe(0);

    const orgCountBefore = await organizer.client.rpc(
      "get_unread_conversation_count",
    );
    expect(orgCountBefore.data).toBe(1);

    await organizer.client.rpc(
      "mark_conversation_read",
      rpcArgs<"mark_conversation_read">({ p_conversation_id: conversationId }),
    );

    const orgCountAfter = await organizer.client.rpc(
      "get_unread_conversation_count",
    );
    expect(orgCountAfter.data).toBe(0);
  });

  it("only the author can edit or delete a message, and the edit window is enforced", async () => {
    const conversationId = await openEventConversation(member);
    const { data: messageId } = await member.client.rpc(
      "send_message",
      rpcArgs<"send_message">({
        p_conversation_id: conversationId,
        p_content: "origional",
      }),
    );

    // The other participant cannot touch it.
    const foreignEdit = await organizer.client.rpc(
      "edit_message",
      rpcArgs<"edit_message">({
        p_message_id: messageId as string,
        p_content: "hijacked",
      }),
    );
    expect(foreignEdit.error?.message).toMatch(/not authorized/i);

    const foreignDelete = await organizer.client.rpc(
      "delete_message",
      rpcArgs<"delete_message">({ p_message_id: messageId as string }),
    );
    expect(foreignDelete.error?.message).toMatch(/not authorized/i);

    // The author can, within the window.
    const ownEdit = await member.client.rpc(
      "edit_message",
      rpcArgs<"edit_message">({
        p_message_id: messageId as string,
        p_content: "original",
      }),
    );
    expect(ownEdit.error).toBeNull();

    // Push the message past the 15-minute window and try again.
    await service
      .from("message")
      .update({ created_at: new Date(Date.now() - 20 * 60_000).toISOString() })
      .eq("id", messageId as string);

    const lateEdit = await member.client.rpc(
      "edit_message",
      rpcArgs<"edit_message">({
        p_message_id: messageId as string,
        p_content: "too late",
      }),
    );
    expect(lateEdit.error?.message).toMatch(/edit window/i);

    // Delete still works and is a soft delete.
    const del = await member.client.rpc(
      "delete_message",
      rpcArgs<"delete_message">({ p_message_id: messageId as string }),
    );
    expect(del.error).toBeNull();

    const { data: row } = await service
      .from("message")
      .select("deleted_at, content")
      .eq("id", messageId as string)
      .single();
    expect(row?.deleted_at).not.toBeNull();
  });

  it("blocking a participant stops messaging in both directions", async () => {
    const conversationId = await openEventConversation(member);
    await member.client.rpc(
      "send_message",
      rpcArgs<"send_message">({
        p_conversation_id: conversationId,
        p_content: "hi",
      }),
    );

    const block = await member.client.rpc(
      "block_participant",
      rpcArgs<"block_participant">({
        p_conversation_id: conversationId,
        p_blocked_id: organizer.id,
        p_block: true,
      }),
    );
    expect(block.error).toBeNull();

    const blockerSend = await member.client.rpc(
      "send_message",
      rpcArgs<"send_message">({
        p_conversation_id: conversationId,
        p_content: "still there?",
      }),
    );
    expect(blockerSend.error?.message).toMatch(/unavailable/i);

    const blockedSend = await organizer.client.rpc(
      "send_message",
      rpcArgs<"send_message">({
        p_conversation_id: conversationId,
        p_content: "hello?",
      }),
    );
    expect(blockedSend.error?.message).toMatch(/unavailable/i);

    // Unblock restores it.
    await member.client.rpc(
      "block_participant",
      rpcArgs<"block_participant">({
        p_conversation_id: conversationId,
        p_blocked_id: organizer.id,
        p_block: false,
      }),
    );
    const afterUnblock = await member.client.rpc(
      "send_message",
      rpcArgs<"send_message">({
        p_conversation_id: conversationId,
        p_content: "back",
      }),
    );
    expect(afterUnblock.error).toBeNull();
  });

  it("mark_conversation_read / set_conversation_state reject a non-participant (RPC-level IDOR)", async () => {
    const conversationId = await openEventConversation(member);

    const read = await outsider.client.rpc(
      "mark_conversation_read",
      rpcArgs<"mark_conversation_read">({ p_conversation_id: conversationId }),
    );
    expect(read.error?.message).toMatch(/not authorized/i);

    const state = await outsider.client.rpc(
      "set_conversation_state",
      rpcArgs<"set_conversation_state">({
        p_conversation_id: conversationId,
        p_archived: true,
      }),
    );
    expect(state.error?.message).toMatch(/not authorized/i);
  });

  it("list_conversations resolves subject + other-participant display fields", async () => {
    const conversationId = await openEventConversation(member);

    const { data } = await member.client.rpc(
      "list_conversations",
      rpcArgs<"list_conversations">({ p_filter: "all" }),
    );
    const row = (data ?? []).find((r) => r.conversation_id === conversationId);
    // subject_title = the live event title; other_* = the organizer.
    expect(row?.subject_title).toBeTruthy();
    expect(row?.other_user_id).toBe(organizer.id);
  });

  it("list_conversations narrows by search, type, and muted", async () => {
    const eventConv = await openEventConversation(member);
    await member.client.rpc(
      "send_message",
      rpcArgs<"send_message">({
        p_conversation_id: eventConv,
        p_content: "hello there",
      }),
    );

    // type filter: only 'place' rows -> the event conversation drops out.
    const places = await member.client.rpc(
      "list_conversations",
      rpcArgs<"list_conversations">({ p_filter: "all", p_type: "place" }),
    );
    expect(
      (places.data ?? []).some((r) => r.conversation_id === eventConv),
    ).toBe(false);

    // search against a string that can't match anything -> empty.
    const noMatch = await member.client.rpc(
      "list_conversations",
      rpcArgs<"list_conversations">({
        p_filter: "all",
        p_search: "zzz-no-such-name-zzz",
      }),
    );
    expect(
      (noMatch.data ?? []).some((r) => r.conversation_id === eventConv),
    ).toBe(false);

    // muted filter reflects set_conversation_state.
    await member.client.rpc(
      "set_conversation_state",
      rpcArgs<"set_conversation_state">({
        p_conversation_id: eventConv,
        p_muted: true,
      }),
    );
    const mutedOnly = await member.client.rpc(
      "list_conversations",
      rpcArgs<"list_conversations">({ p_filter: "all", p_muted: true }),
    );
    expect(
      (mutedOnly.data ?? []).some((r) => r.conversation_id === eventConv),
    ).toBe(true);
    const unmutedOnly = await member.client.rpc(
      "list_conversations",
      rpcArgs<"list_conversations">({ p_filter: "all", p_muted: false }),
    );
    expect(
      (unmutedOnly.data ?? []).some((r) => r.conversation_id === eventConv),
    ).toBe(false);
  });

  it("mark_conversation_unread rewinds the read cursor; rejects a non-participant", async () => {
    const conversationId = await openEventConversation(member);
    await member.client.rpc(
      "send_message",
      rpcArgs<"send_message">({
        p_conversation_id: conversationId,
        p_content: "a question",
      }),
    );

    // Organizer reads it -> unread clears.
    await organizer.client.rpc(
      "mark_conversation_read",
      rpcArgs<"mark_conversation_read">({ p_conversation_id: conversationId }),
    );
    const cleared = await organizer.client.rpc("get_unread_conversation_count");
    expect(cleared.data).toBe(0);

    // Then marks it unread again.
    const unread = await organizer.client.rpc(
      "mark_conversation_unread",
      rpcArgs<"mark_conversation_unread">({
        p_conversation_id: conversationId,
      }),
    );
    expect(unread.error).toBeNull();
    const back = await organizer.client.rpc("get_unread_conversation_count");
    expect(back.data).toBe(1);

    // A non-participant can't touch it.
    const outsiderTry = await outsider.client.rpc(
      "mark_conversation_unread",
      rpcArgs<"mark_conversation_unread">({
        p_conversation_id: conversationId,
      }),
    );
    expect(outsiderTry.error?.message).toMatch(/not authorized/i);
  });

  it("a participant cannot escalate their role via a direct table write", async () => {
    const conversationId = await openEventConversation(member);
    const { error } = await member.client
      .from("conversation_participant")
      .update({ role: "admin" })
      .eq("conversation_id", conversationId)
      .eq("user_id", member.id);
    // No UPDATE grant/policy exists for authenticated on this table.
    expect(error).not.toBeNull();

    const { data } = await service
      .from("conversation_participant")
      .select("role")
      .eq("conversation_id", conversationId)
      .eq("user_id", member.id)
      .single();
    expect(data?.role).toBe("member");
  });
});
