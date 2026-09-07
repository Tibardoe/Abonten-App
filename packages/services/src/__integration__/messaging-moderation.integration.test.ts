import { fetchConversationsPage } from "@abonten/services/messaging/conversationsQuery";
import { fetchMessagesPage } from "@abonten/services/messaging/messagesQuery";
import { openConversationCore } from "@abonten/services/messaging/openConversationCore";
import { sendMessageCore } from "@abonten/services/messaging/sendMessageCore";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root),
// rebuilt after the Phase 6 (role scope) + Phase 8 (moderation) migrations.
//
// Covers:
//   * Phase 6 — list_conversations p_role_scope splits the unified inbox:
//     the customer sees the thread under "member", the organizer sees the
//     same thread under "business", and neither sees it under the other.
//   * Phase 8 — read-path hardening: a conversation whose moderation_state
//     is 'hidden' / 'removed' drops out of the participant's inbox; a
//     'hidden' / 'removed' message drops out of the thread page. (The
//     apply_moderation_action RPC's own admin-auth is covered elsewhere;
//     here we set the state directly with the service client and assert the
//     participant read paths react.)
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("messaging: role scope + moderation read paths", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let member: TestUser;
  let eventId: string;
  let conversationId: string;

  beforeEach(async () => {
    service = getServiceClient();
    organizer = await createTestUser(service);
    member = await createTestUser(service);
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
    expect(conversationId).toBeTruthy();

    // one real message so the thread has content + a last_message_at
    await sendMessageCore(member.client, member.id, {
      conversationId,
      content: "hello organizer",
    });
  });

  afterEach(async () => {
    await deleteTestEvent(service, eventId);
    await deleteTestUser(service, organizer.id);
    await deleteTestUser(service, member.id);
  });

  it("role scope splits the same thread between the two sides", async () => {
    const memberAll = await fetchConversationsPage(member.client, member.id, {
      roleScope: "all",
    });
    const memberAsMember = await fetchConversationsPage(
      member.client,
      member.id,
      { roleScope: "member" },
    );
    const memberAsBusiness = await fetchConversationsPage(
      member.client,
      member.id,
      { roleScope: "business" },
    );

    expect(memberAll.data.map((c) => c.conversation_id)).toContain(
      conversationId,
    );
    expect(memberAsMember.data.map((c) => c.conversation_id)).toContain(
      conversationId,
    );
    expect(memberAsBusiness.data.map((c) => c.conversation_id)).not.toContain(
      conversationId,
    );

    const orgAsBusiness = await fetchConversationsPage(
      organizer.client,
      organizer.id,
      { roleScope: "business" },
    );
    const orgAsMember = await fetchConversationsPage(
      organizer.client,
      organizer.id,
      { roleScope: "member" },
    );

    expect(orgAsBusiness.data.map((c) => c.conversation_id)).toContain(
      conversationId,
    );
    expect(orgAsMember.data.map((c) => c.conversation_id)).not.toContain(
      conversationId,
    );
  });

  it("a hidden conversation leaves both participants' inboxes", async () => {
    await service
      .from("conversation")
      .update({ moderation_state: "hidden" })
      .eq("id", conversationId);

    const memberList = await fetchConversationsPage(member.client, member.id, {
      filter: "all",
    });
    const orgList = await fetchConversationsPage(
      organizer.client,
      organizer.id,
      { filter: "all" },
    );

    expect(memberList.data.map((c) => c.conversation_id)).not.toContain(
      conversationId,
    );
    expect(orgList.data.map((c) => c.conversation_id)).not.toContain(
      conversationId,
    );
  });

  it("a hidden message drops out of the thread page", async () => {
    const before = await fetchMessagesPage(member.client, conversationId, {});
    const target = before.data.find((m) => m.content === "hello organizer");
    expect(target).toBeTruthy();

    await service
      .from("message")
      .update({ moderation_state: "hidden" })
      .eq("id", target?.id as string);

    const after = await fetchMessagesPage(member.client, conversationId, {});
    expect(after.data.map((m) => m.id)).not.toContain(target?.id);
  });

  it("a removed message drops out of the thread page", async () => {
    const before = await fetchMessagesPage(member.client, conversationId, {});
    const target = before.data.find((m) => m.content === "hello organizer");

    await service
      .from("message")
      .update({ moderation_state: "removed" })
      .eq("id", target?.id as string);

    const after = await fetchMessagesPage(member.client, conversationId, {});
    expect(after.data.map((m) => m.id)).not.toContain(target?.id);
  });
});
