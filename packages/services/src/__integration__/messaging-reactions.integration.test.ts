import { fetchMessagesPage } from "@abonten/services/messaging/messagesQuery";
import { openConversationCore } from "@abonten/services/messaging/openConversationCore";
import { toggleReactionCore } from "@abonten/services/messaging/reactionMutationsCore";
import { sendMessageCore } from "@abonten/services/messaging/sendMessageCore";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up), rebuilt after
// 20260908133841_message_reactions.sql + 20260908142212_message_reaction_
// single_per_user.sql.
//
// Covers the toggle_message_reaction RPC + the reaction rollup in
// fetchMessagesPage:
//   * a participant can add then toggle-off their reaction (idempotent);
//   * picking a different emoji REPLACES the caller's previous one
//     (one reaction per user per message);
//   * the rollup marks the caller's own reaction and counts the other side's;
//   * a non-participant cannot react (RPC raises 42501 -> 403 envelope);
//   * an emoji outside the fixed palette is refused (23514 -> 409).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("messaging: reactions", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let eventId: string;
  let conversationId: string;
  let messageId: string;

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

    const opened = await openConversationCore(member.client, member.id, {
      type: "event",
      eventId,
    });
    conversationId = opened.data?.conversationId as string;

    await sendMessageCore(member.client, member.id, {
      conversationId,
      content: "are tickets still available?",
    });
    const page = await fetchMessagesPage(member.client, conversationId, {});
    messageId = page.data.find(
      (m) => m.content === "are tickets still available?",
    )?.id as string;
    expect(messageId).toBeTruthy();
  });

  afterEach(async () => {
    await deleteTestEvent(service, eventId);
    await deleteTestUser(service, organizer.id);
    await deleteTestUser(service, member.id);
    await deleteTestUser(service, outsider.id);
  });

  it("adds then toggles off the caller's own reaction (idempotent)", async () => {
    const add = await toggleReactionCore(organizer.client, organizer.id, {
      messageId,
      emoji: "👍",
    });
    expect(add.status).toBe(200);
    expect(add.data?.added).toBe(true);

    let page = await fetchMessagesPage(organizer.client, conversationId, {});
    let row = page.data.find((m) => m.id === messageId);
    expect(row?.reactions).toEqual([
      { emoji: "👍", count: 1, reacted_by_me: true },
    ]);

    const remove = await toggleReactionCore(organizer.client, organizer.id, {
      messageId,
      emoji: "👍",
    });
    expect(remove.status).toBe(200);
    expect(remove.data?.added).toBe(false);

    page = await fetchMessagesPage(organizer.client, conversationId, {});
    row = page.data.find((m) => m.id === messageId);
    expect(row?.reactions ?? []).toEqual([]);
  });

  it("replaces the caller's previous emoji when they pick another", async () => {
    const first = await toggleReactionCore(organizer.client, organizer.id, {
      messageId,
      emoji: "👍",
    });
    expect(first.data?.added).toBe(true);

    const second = await toggleReactionCore(organizer.client, organizer.id, {
      messageId,
      emoji: "❤️",
    });
    expect(second.status).toBe(200);
    expect(second.data?.added).toBe(true);

    const page = await fetchMessagesPage(organizer.client, conversationId, {});
    const row = page.data.find((m) => m.id === messageId);
    // Only the new emoji remains — one reaction per user per message.
    expect(row?.reactions).toEqual([
      { emoji: "❤️", count: 1, reacted_by_me: true },
    ]);

    const { data } = await service
      .from("message_reaction")
      .select("emoji")
      .eq("message_id", messageId)
      .eq("user_id", organizer.id);
    expect(data).toEqual([{ emoji: "❤️" }]);
  });

  it("rolls up both sides and flags only the caller's own", async () => {
    await toggleReactionCore(member.client, member.id, {
      messageId,
      emoji: "❤️",
    });
    await toggleReactionCore(organizer.client, organizer.id, {
      messageId,
      emoji: "❤️",
    });

    const asMember = await fetchMessagesPage(member.client, conversationId, {});
    const memberRow = asMember.data.find((m) => m.id === messageId);
    expect(memberRow?.reactions).toEqual([
      { emoji: "❤️", count: 2, reacted_by_me: true },
    ]);

    const asOrganizer = await fetchMessagesPage(
      organizer.client,
      conversationId,
      {},
    );
    const orgRow = asOrganizer.data.find((m) => m.id === messageId);
    expect(orgRow?.reactions).toEqual([
      { emoji: "❤️", count: 2, reacted_by_me: true },
    ]);
  });

  it("refuses a non-participant", async () => {
    const res = await toggleReactionCore(outsider.client, outsider.id, {
      messageId,
      emoji: "👍",
    });
    expect(res.status).toBe(403);

    // and nothing was written
    const { data } = await service
      .from("message_reaction")
      .select("user_id")
      .eq("message_id", messageId);
    expect(data ?? []).toEqual([]);
  });

  it("refuses an emoji outside the fixed palette", async () => {
    const res = await toggleReactionCore(organizer.client, organizer.id, {
      messageId,
      emoji: "🤡",
    });
    expect(res.status).toBe(409);
  });

  // message_reaction also carries an own-row RLS INSERT policy, so a
  // participant can reach the table directly with the client SDK, bypassing
  // toggle_message_reaction. These two cover the table-level guards added in
  // 20260908170944_message_reaction_table_hardening.sql.
  describe("direct-table writes (bypassing the RPC)", () => {
    it("rejects an off-palette 'emoji' written straight to the table", async () => {
      const { error } = await organizer.client.from("message_reaction").insert({
        message_id: messageId,
        user_id: organizer.id,
        emoji: "SPAM",
        conversation_id: conversationId,
      });
      // 23514 = check_violation (message_reaction_emoji_palette)
      expect(error?.code).toBe("23514");

      const { data } = await service
        .from("message_reaction")
        .select("emoji")
        .eq("message_id", messageId);
      expect(data ?? []).toEqual([]);
    });

    it("refuses a reaction forged under another user's id", async () => {
      // message_reaction_own_insert's WITH CHECK pins user_id to auth.uid(),
      // so a participant cannot make it look like the OTHER participant
      // reacted (Phase 8: "user cannot impersonate another user's reaction").
      const { error } = await organizer.client.from("message_reaction").insert({
        message_id: messageId,
        user_id: member.id,
        emoji: "👍",
        conversation_id: conversationId,
      });
      // 42501 = RLS violation
      expect(error?.code).toBe("42501");

      const { data } = await service
        .from("message_reaction")
        .select("user_id")
        .eq("message_id", messageId);
      expect(data ?? []).toEqual([]);
    });

    it("refuses tampering with another user's existing reaction", async () => {
      // member reacts through the proper path...
      const added = await toggleReactionCore(member.client, member.id, {
        messageId,
        emoji: "❤️",
      });
      expect(added.status).toBe(200);

      // ...the organizer (a fellow participant, so they can READ it) can
      // neither change nor delete it: both own-row policies key on auth.uid().
      const upd = await organizer.client
        .from("message_reaction")
        .update({ emoji: "😂" })
        .eq("message_id", messageId)
        .eq("user_id", member.id);
      const del = await organizer.client
        .from("message_reaction")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", member.id);

      // RLS makes these no-ops rather than errors (no row is visible to
      // write), so assert on the surviving row, which is what matters.
      expect(upd.error?.code ?? "no-op").toBeTruthy();
      expect(del.error?.code ?? "no-op").toBeTruthy();

      const { data } = await service
        .from("message_reaction")
        .select("user_id, emoji")
        .eq("message_id", messageId);
      expect(data).toEqual([{ user_id: member.id, emoji: "❤️" }]);
    });

    it("overrides a forged conversation_id with the message's own", async () => {
      // A conversation id this message does not belong to. The BEFORE-INSERT
      // trigger rewrites it from the parent message ahead of the foreign-key
      // check, so the insert succeeds with the CORRECT id — proving the
      // client-supplied value is ignored outright rather than merely
      // validated.
      const forged = "00000000-0000-4000-8000-0000000000ff";
      const { error } = await organizer.client.from("message_reaction").insert({
        message_id: messageId,
        user_id: organizer.id,
        emoji: "👍",
        conversation_id: forged,
      });
      expect(error).toBeNull();

      const { data } = await service
        .from("message_reaction")
        .select("conversation_id")
        .eq("message_id", messageId)
        .single();
      expect(data?.conversation_id).toBe(conversationId);
      expect(data?.conversation_id).not.toBe(forged);
    });
  });
});
