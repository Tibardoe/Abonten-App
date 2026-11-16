import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Team accounts, stage 4 (docs/architecture/team-accounts.md §4c): the
// members who answer a team's messages read and reply in its
// conversations as the team (customers see the team only, X7); the members
// who answer reviews reply to the team's reviews; nobody reviews or
// messages, as a customer, a team they belong to.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  answerTeamInviteCore,
  createTeamCore,
  inviteTeamMemberCore,
} from "../teams/teamCore";
import { resetTeamSettingsCache } from "../teams/teamProgram";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const noText = { canTextNumber: async () => false };

describe("a team's messages and reviews", () => {
  let service: SupabaseClient<Database>;
  let svc: ServiceRoleClient;
  const users: TestUser[] = [];
  let owner: TestUser;
  let content: TestUser;
  let manager: TestUser;
  let customer: TestUser;
  let teamId: string;
  let eventId: string;
  let placeId: string;
  let conversationId: string;

  async function person(): Promise<TestUser> {
    const u = await createTestUser(service);
    users.push(u);
    await service
      .from("user_info")
      .update({ username: `tx_${u.id.slice(0, 8)}`, full_name: "Inbox Person" })
      .eq("id", u.id);
    return u;
  }

  async function join(who: TestUser, role: "content" | "manager") {
    const sent = await inviteTeamMemberCore(
      svc,
      owner.id,
      {
        teamId,
        role,
        target: { kind: "username", username: `tx_${who.id.slice(0, 8)}` },
      },
      noText,
    );
    if (sent.status !== 200) throw new Error(sent.message);
    const res = await answerTeamInviteCore(svc, who.id, {
      inviteId: sent.data.id,
      action: "accept",
    });
    if (res.status !== 200) throw new Error(res.message);
  }

  beforeAll(async () => {
    service = getServiceClient();
    svc = service as unknown as ServiceRoleClient;
    await service
      .from("team_program_setting")
      .update({ enabled: true, audience: "all" })
      .eq("id", 1);
    resetTeamSettingsCache();
    owner = await person();
    [content, manager, customer] = await Promise.all([
      person(),
      person(),
      person(),
    ]);
    const made = await createTeamCore(svc, owner.id, {
      name: "Inbox Crew",
      username: `txt_${crypto.randomUUID().slice(0, 8)}`,
    });
    if (made.status !== 200) throw new Error(made.message);
    teamId = made.data.id;
    await join(content, "content");
    await join(manager, "manager");

    ({ eventId } = await createTestEventWithTicketType(service, teamId, {
      quantity: 10,
      price: 0,
    }));
    const { data: category } = await service
      .from("place_category")
      .select("id")
      .limit(1)
      .single();
    const { data: place, error } = await service
      .from("place")
      .insert({
        country_code: "GH",
        timezone: "Africa/Accra",
        owner_id: teamId,
        name: "Inbox Lounge",
        slug: `inbox-lounge-${crypto.randomUUID()}`,
        description: "Run by a team.",
        category_id: category?.id as number,
        location: "POINT(-0.187 5.6037)",
        address: { city: "Accra", country: "Ghana" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
      } as never)
      .select("id")
      .single();
    if (error || !place) throw new Error(error?.message);
    placeId = (place as { id: string }).id;

    const { data: conv, error: convError } = await customer.client.rpc(
      "open_conversation",
      { p_type: "event", p_event_id: eventId },
    );
    if (convError) throw new Error(convError.message);
    conversationId = conv as string;
  });

  afterAll(async () => {
    await service
      .from("team_program_setting")
      .update({ enabled: false })
      .eq("id", 1);
    resetTeamSettingsCache();
    await service.from("conversation").delete().eq("id", conversationId);
    await service.from("place_review").delete().eq("place_id", placeId);
    await service.from("place").delete().eq("id", placeId);
    await deleteTestEvent(service, eventId).catch(() => undefined);
    await service.from("notification").delete().eq("user_id", teamId);
    await service.auth.admin.deleteUser(teamId).catch(() => undefined);
    await Promise.all(users.map((u) => deleteTestUser(service, u.id)));
  });

  it("the members who answer messages see the team's inbox; others are refused", async () => {
    const { data, error } = await content.client.rpc("list_conversations", {
      p_account: teamId,
    });
    expect(error).toBeNull();
    expect(
      (data as { conversation_id: string }[]).map((r) => r.conversation_id),
    ).toContain(conversationId);
    const { error: refused } = await manager.client.rpc("list_conversations", {
      p_account: teamId,
    });
    expect(refused?.message).toMatch(/not allowed/i);
    const { data: managerReads } = await manager.client
      .from("message")
      .select("id")
      .eq("conversation_id", conversationId);
    expect(managerReads ?? []).toHaveLength(0);
  });

  it("a member's reply goes out as the team; who wrote it stays inside", async () => {
    const { data: messageId, error } = await content.client.rpc(
      "send_message",
      { p_conversation_id: conversationId, p_content: "Doors open at 8." },
    );
    expect(error).toBeNull();
    const { data: seen } = await customer.client
      .from("message")
      .select("sender_id, content")
      .eq("id", messageId as string)
      .single();
    expect(seen?.sender_id).toBe(teamId);
    const { data: who } = await service
      .from("message_team_sender")
      .select("member_id")
      .eq("message_id", messageId as string)
      .single();
    expect(who?.member_id).toBe(content.id);
    const { data: hidden, error: hiddenError } = await customer.client
      .from("message_team_sender")
      .select("member_id");
    expect(hidden ?? []).toHaveLength(0);
    expect(hiddenError).not.toBeNull();
  });

  it("a member does not message their own team as a customer", async () => {
    const { error } = await manager.client.rpc("open_conversation", {
      p_type: "event",
      p_event_id: eventId,
    });
    expect(error?.message).toMatch(/own event/i);
  });

  it("the members who answer reviews reply to the team's; nobody reviews their own team", async () => {
    const { data: review, error } = await service
      .from("place_review")
      .insert({
        place_id: placeId,
        reviewer_id: customer.id,
        rating: 4,
        title: "Lovely rooftop",
        comment: "Great view.",
      } as never)
      .select("id")
      .single();
    if (error || !review) throw new Error(error?.message);
    const reviewId = (review as { id: string }).id;
    const reply = (who: TestUser, text: string) =>
      who.client
        .from("place_review")
        .update({ owner_response: text } as never)
        .eq("id", reviewId)
        .select("id");
    expect((await reply(manager, "no")).data ?? []).toHaveLength(0);
    expect((await reply(content, "Thank you!")).data).toHaveLength(1);

    const { error: ownReview } = await content.client
      .from("place_review")
      .insert({
        place_id: placeId,
        reviewer_id: content.id,
        rating: 5,
        title: "Best place",
        comment: "I run it.",
      } as never);
    expect(ownReview?.message).toMatch(/own place/i);
  });
});
