import { markConversationReadCore } from "@abonten/services/messaging/conversationStateCore";
import { fetchConversationsPage } from "@abonten/services/messaging/conversationsQuery";
import { getConversationContext } from "@abonten/services/messaging/conversationsQuery";
import { getUnreadMessageCount } from "@abonten/services/messaging/conversationsQuery";
import { deleteMessageCore } from "@abonten/services/messaging/messageMutationsCore";
import { fetchMessagesPage } from "@abonten/services/messaging/messagesQuery";
import { openConversationCore } from "@abonten/services/messaging/openConversationCore";
import { sendMessageCore } from "@abonten/services/messaging/sendMessageCore";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Exercises the @abonten/services/messaging Core layer that both the web
// Server Actions and the /api/mobile/messages routes call — the thin
// wrappers over the RPCs plus the direct-RLS read queries (message page
// shaping, deleted-message redaction, reply previews, conversation-context
// 404-on-non-participant). The RPC internals themselves are covered by
// messaging.integration.test.ts.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("messaging service layer (Cores + read queries)", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let eventId: string;
  let conversationId: string;

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
    expect(opened.status).toBe(200);
    conversationId = opened.data?.conversationId as string;
    expect(conversationId).toBeTruthy();
  });

  afterEach(async () => {
    await deleteTestEvent(service, eventId);
    await deleteTestUser(service, organizer.id);
    await deleteTestUser(service, member.id);
    await deleteTestUser(service, outsider.id);
  });

  it("openConversationCore is idempotent and maps a self-target to 409", async () => {
    const again = await openConversationCore(member.client, member.id, {
      type: "event",
      eventId,
    });
    expect(again.data?.conversationId).toBe(conversationId);

    const ownEvent = await openConversationCore(
      organizer.client,
      organizer.id,
      {
        type: "event",
        eventId,
      },
    );
    expect(ownEvent.status).toBe(409);
    expect(ownEvent.message).toMatch(/your own event/i);
  });

  it("sendMessageCore returns the canonical row; a non-participant gets 403", async () => {
    const sent = await sendMessageCore(member.client, member.id, {
      conversationId,
      content: "Is parking available?",
    });
    expect(sent.status).toBe(200);
    expect(sent.data?.message.content).toBe("Is parking available?");
    expect(sent.data?.message.sender_id).toBe(member.id);
    expect(sent.data?.message.attachments).toEqual([]);

    const denied = await sendMessageCore(outsider.client, outsider.id, {
      conversationId,
      content: "hello",
    });
    expect(denied.status).toBe(403);
  });

  it("sendMessageCore stores a voice note as an audio message with duration + a '[Voice message]' preview", async () => {
    const path = `${conversationId}/${crypto.randomUUID()}.m4a`;
    const sent = await sendMessageCore(member.client, member.id, {
      conversationId,
      content: null,
      // messageType left at the default — send_message classifies it from
      // the first attachment's audio/* MIME.
      attachments: [
        {
          storagePath: path,
          mimeType: "audio/m4a",
          fileName: "voice-message.m4a",
          fileSize: 4096,
          durationSeconds: 12,
        },
      ],
    });
    expect(sent.status).toBe(200);
    expect(sent.data?.message.message_type).toBe("audio");
    expect(sent.data?.message.attachments).toHaveLength(1);
    expect(sent.data?.message.attachments[0].storage_path).toBe(path);
    expect(Number(sent.data?.message.attachments[0].duration_seconds)).toBe(12);

    const list = await fetchConversationsPage(organizer.client, organizer.id, {
      filter: "all",
    });
    const row = list.data.find((r) => r.conversation_id === conversationId);
    expect(row?.last_message_preview).toBe("[Voice message]");

    // A non-participant still cannot attach anything to the thread.
    const denied = await sendMessageCore(outsider.client, outsider.id, {
      conversationId,
      content: null,
      attachments: [
        { storagePath: `${conversationId}/x.m4a`, mimeType: "audio/m4a" },
      ],
    });
    expect(denied.status).toBe(403);
  });

  it("fetchMessagesPage returns newest-first, resolves replies, redacts deletes", async () => {
    const first = await sendMessageCore(member.client, member.id, {
      conversationId,
      content: "First question",
    });
    const firstId = first.data?.message.id as string;

    await sendMessageCore(organizer.client, organizer.id, {
      conversationId,
      content: "Replying to that",
      replyToMessageId: firstId,
    });

    const page = await fetchMessagesPage(member.client, conversationId, {
      pageSize: 20,
    });
    expect(page.status).toBe(200);
    // newest first: [reply, first question, system "conversation_started"]
    expect(page.data[0].content).toBe("Replying to that");
    expect(page.data[0].reply_to?.id).toBe(firstId);
    expect(page.data[0].reply_to?.content).toBe("First question");
    expect(page.data.at(-1)?.message_type).toBe("system");

    // Soft delete redacts content + attachments in the page payload.
    const del = await deleteMessageCore(member.client, member.id, {
      messageId: firstId,
    });
    expect(del.status).toBe(200);

    const afterDelete = await fetchMessagesPage(member.client, conversationId, {
      pageSize: 20,
    });
    const deletedRow = afterDelete.data.find((m) => m.id === firstId);
    expect(deletedRow?.deleted_at).toBeTruthy();
    expect(deletedRow?.content).toBeNull();
    expect(deletedRow?.attachments).toEqual([]);
  });

  it("fetchConversationsPage + getUnreadMessageCount reflect the recipient's unread", async () => {
    await sendMessageCore(member.client, member.id, {
      conversationId,
      content: "ping",
    });

    const list = await fetchConversationsPage(organizer.client, organizer.id, {
      filter: "all",
    });
    expect(list.status).toBe(200);
    const row = list.data.find((r) => r.conversation_id === conversationId);
    expect(row?.unread_count).toBe(1);
    expect(row?.event_id).toBe(eventId);

    const count = await getUnreadMessageCount(organizer.client, organizer.id);
    expect(count.count).toBe(1);

    const senderCount = await getUnreadMessageCount(member.client, member.id);
    expect(senderCount.count).toBe(0);
  });

  it("getConversationContext gives a participant the subject + 404s a non-participant", async () => {
    const ctx = await getConversationContext(
      member.client,
      member.id,
      conversationId,
    );
    expect(ctx.status).toBe(200);
    expect(ctx.data?.subject.event?.id).toBe(eventId);
    expect(ctx.data?.my_participant.role).toBe("member");
    expect(ctx.data?.participants.map((p) => p.user_id).sort()).toEqual(
      [member.id, organizer.id].sort(),
    );

    const outsiderCtx = await getConversationContext(
      outsider.client,
      outsider.id,
      conversationId,
    );
    expect(outsiderCtx.status).toBe(404);
  });

  it("markConversationReadCore rejects a non-participant with 403", async () => {
    const res = await markConversationReadCore(outsider.client, outsider.id, {
      conversationId,
    });
    expect(res.status).toBe(403);
  });
});
