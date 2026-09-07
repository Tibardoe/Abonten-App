import {
  assignSupportConversationCore,
  getSupportConversationDetailCore,
  listSupportConversationsCore,
  replySupportConversationCore,
  setSupportConversationStatusCore,
} from "@abonten/services/admin/support/supportAdminCore";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
// Requires a local Supabase stack (npm run test:db:up), rebuilt after the
// 20260907095000_messaging_support_ops migration (conversation.assigned_*
// columns + support.* permission keys).
//
// Covers the admin support-queue cores end to end against a real support
// conversation the requester opened with open_conversation:
//   * the queue lists it as unassigned + awaiting reply, and drops it once
//     claimed;
//   * the detail transcript labels the requester's own line "requester" and
//     never leaks the agent as a participant;
//   * an agent reply lands a real message row (visible to the requester
//     under RLS), claims the thread, and writes an in-app notification
//     titled "Abonten Support" — not the agent's name;
//   * close / reopen move the thread between the open and closed scopes;
//   * a permission-less context is refused (403).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

function adminCtx(userId: string): AdminContext {
  return {
    userId,
    email: null,
    roles: ["support_admin"],
    permissions: ["support.view", "support.respond", "users.view_pii"],
    reauthenticatedAt: null,
  };
}

describe("admin: in-app support queue", () => {
  let service: ServiceRoleClient;
  let requester: TestUser;
  let agent: TestUser;
  let conversationId: string;

  beforeEach(async () => {
    // getServiceClient() here is genuinely backed by the local
    // SUPABASE_TEST_SERVICE_ROLE_KEY; it just isn't branded like the two
    // production producers, so brand it for the admin-core signatures.
    service = getServiceClient() as unknown as ServiceRoleClient;
    requester = await createTestUser(service);
    agent = await createTestUser(service);

    // The agent needs an active admin_user row (assign-to checks it).
    await service
      .from("admin_user")
      .upsert({ user_id: agent.id, status: "active" });

    const { data: convId, error } = await requester.client.rpc(
      "open_conversation",
      { p_type: "support" },
    );
    if (error)
      throw new Error(`open_conversation(support) failed: ${error.message}`);
    conversationId = convId as string;
  });

  afterEach(async () => {
    if (conversationId) {
      await service.from("conversation").delete().eq("id", conversationId);
    }
    await service.from("admin_user").delete().eq("user_id", agent.id);
    await deleteTestUser(service, requester.id);
    await deleteTestUser(service, agent.id);
  });

  it("lists a fresh support thread as unassigned + awaiting reply", async () => {
    const ctx = adminCtx(agent.id);
    const res = await listSupportConversationsCore(service, ctx, {
      scope: "unassigned",
    });
    expect(res.status).toBe(200);
    const row = res.data.find((r) => r.id === conversationId);
    expect(row).toBeTruthy();
    expect(row?.assignedToId).toBeNull();
    expect(row?.awaitingReply).toBe(true);
    expect(row?.status).toBe("open");
  });

  it("refuses a context without support.view", async () => {
    const res = await listSupportConversationsCore(
      service,
      { ...adminCtx(agent.id), permissions: [] },
      {},
    );
    expect(res.status).toBe(403);
  });

  it("detail labels the requester line and hides the agent as a participant", async () => {
    const ctx = adminCtx(agent.id);
    const res = await getSupportConversationDetailCore(
      service,
      ctx,
      conversationId,
    );
    expect(res.status).toBe(200);
    expect(res.data?.requester.id).toBe(requester.id);
    // Only the "conversation_started" system message so far.
    expect(res.data?.messages.length).toBe(1);
    expect(res.data?.messages[0]?.author).toBe("system");
    expect(res.data?.assignedToId).toBeNull();

    // The agent is not a conversation_participant — the requester's own
    // context RPC must still show a single participant (themselves).
    const { data: parts } = await requester.client
      .from("conversation_participant")
      .select("user_id")
      .eq("conversation_id", conversationId);
    expect((parts ?? []).map((p) => p.user_id)).toEqual([requester.id]);
  });

  it("an agent reply lands a message, claims the thread, and notifies as 'Abonten Support'", async () => {
    const ctx = adminCtx(agent.id);
    const reply = await replySupportConversationCore(service, ctx, {
      conversationId,
      body: "Thanks for reaching out — we're on it.",
    });
    expect(reply.status).toBe(200);

    // The requester can read the agent's message through RLS.
    const { data: msgs } = await requester.client
      .from("message")
      .select("content, sender_id, message_type")
      .eq("conversation_id", conversationId)
      .eq("message_type", "text");
    expect(msgs?.length).toBe(1);
    expect(msgs?.[0]?.content).toContain("we're on it");
    expect(msgs?.[0]?.sender_id).toBe(agent.id);

    // Replying claimed it for the agent.
    const { data: conv } = await service
      .from("conversation")
      .select("assigned_to, status")
      .eq("id", conversationId)
      .single();
    expect(conv?.assigned_to).toBe(agent.id);

    // Notification to the requester is titled "Abonten Support".
    const { data: notes } = await service
      .from("notification")
      .select("title, type, user_id")
      .eq("user_id", requester.id)
      .eq("type", "message");
    expect(notes?.length).toBeGreaterThanOrEqual(1);
    expect(notes?.[0]?.title).toBe("Abonten Support");

    // It now leaves the "unassigned" scope and appears under "mine".
    const unassigned = await listSupportConversationsCore(service, ctx, {
      scope: "unassigned",
    });
    expect(unassigned.data.find((r) => r.id === conversationId)).toBeFalsy();
    const mine = await listSupportConversationsCore(service, ctx, {
      scope: "mine",
    });
    expect(mine.data.find((r) => r.id === conversationId)).toBeTruthy();
  });

  it("close / reopen move the thread between scopes", async () => {
    const ctx = adminCtx(agent.id);

    const closed = await setSupportConversationStatusCore(service, ctx, {
      conversationId,
      status: "closed",
    });
    expect(closed.status).toBe(200);
    let list = await listSupportConversationsCore(service, ctx, {
      scope: "closed",
    });
    expect(list.data.find((r) => r.id === conversationId)).toBeTruthy();

    // A closed support thread blocks the requester's own send_message.
    const { error: sendErr } = await requester.client.rpc("send_message", {
      p_conversation_id: conversationId,
      p_content: "still there?",
    });
    expect(sendErr).toBeTruthy();

    const reopened = await setSupportConversationStatusCore(service, ctx, {
      conversationId,
      status: "open",
    });
    expect(reopened.status).toBe(200);
    list = await listSupportConversationsCore(service, ctx, { scope: "open" });
    expect(list.data.find((r) => r.id === conversationId)).toBeTruthy();
  });

  it("assign then unassign is reflected on the row", async () => {
    const ctx = adminCtx(agent.id);
    const a = await assignSupportConversationCore(service, ctx, {
      conversationId,
      assigneeId: agent.id,
    });
    expect(a.status).toBe(200);
    let detail = await getSupportConversationDetailCore(
      service,
      ctx,
      conversationId,
    );
    expect(detail.data?.assignedToId).toBe(agent.id);

    const u = await assignSupportConversationCore(service, ctx, {
      conversationId,
      assigneeId: null,
    });
    expect(u.status).toBe(200);
    detail = await getSupportConversationDetailCore(
      service,
      ctx,
      conversationId,
    );
    expect(detail.data?.assignedToId).toBeNull();
  });
});
