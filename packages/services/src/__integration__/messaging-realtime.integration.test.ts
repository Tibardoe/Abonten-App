import {
  MESSAGING_BROADCAST_EVENTS,
  MESSAGING_INBOX_EVENTS,
  conversationChannelName,
  userInboxChannelName,
} from "@abonten/core/messagingRealtime";
import { openConversationCore } from "@abonten/services/messaging/openConversationCore";
import { sendMessageCore } from "@abonten/services/messaging/sendMessageCore";
import type { Database } from "@abonten/types/database.types";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root),
// including the realtime service (config.toml [realtime] enabled = true).
//
// Verifies the security-critical half of the Phase 3 realtime layer
// (20260907091000_messaging_realtime): the private-channel authorization
// policies on `realtime.messages`. A PARTICIPANT can join the private
// `conversation:<id>` channel (used for the ephemeral typing indicator +
// presence); a NON-participant's join is refused with CHANNEL_ERROR, so a
// realtime subscription can't be used to eavesdrop on a thread.
//
// Since 20260918120100 the durable change events travel the same private
// channels, sent by database triggers (realtime.send) instead of streamed as
// postgres_changes. The second block below proves that delivery end to end
// against the local Realtime server: who receives what, that bodies never
// ride the channel, and that `inbox:<id>` is readable only by its owner.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type TestUser,
  createSessionClient,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// A signed-in session client per user, as the apps hold (see
// createSessionClient for why the header-only test client can't be used for
// more than one private channel). Disconnected in each suite's afterEach.
const sessionClients = new Map<string, SupabaseClient<Database>>();
async function authedRealtime(
  user: TestUser,
): Promise<SupabaseClient<Database>> {
  let client = sessionClients.get(user.id);
  if (!client) {
    client = await createSessionClient(user);
    sessionClients.set(user.id, client);
  }
  return client;
}
function disconnectSessions() {
  for (const c of sessionClients.values()) c.realtime.disconnect();
  sessionClients.clear();
}

function subscribeStatus(
  channel: RealtimeChannel,
  timeoutMs = 20_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("subscribe timed out")),
      timeoutMs,
    );
    channel.subscribe((status) => {
      if (
        status === "SUBSCRIBED" ||
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT"
      ) {
        clearTimeout(timer);
        resolve(status);
      }
    });
  });
}

describe("messaging realtime: private channel authorization", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let eventId: string;
  let conversationId: string;
  const openChannels: RealtimeChannel[] = [];

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
  });

  afterEach(async () => {
    for (const ch of openChannels.splice(0)) {
      try {
        await ch.unsubscribe();
      } catch {
        /* ignore */
      }
    }
    disconnectSessions();
    await deleteTestEvent(service, eventId);
    await deleteTestUser(service, organizer.id);
    await deleteTestUser(service, member.id);
    await deleteTestUser(service, outsider.id);
  });

  it("a participant can join the private conversation channel; an outsider cannot", async () => {
    const memberCh = (await authedRealtime(member)).channel(
      conversationChannelName(conversationId),
      { config: { private: true } },
    );
    openChannels.push(memberCh);
    expect(await subscribeStatus(memberCh)).toBe("SUBSCRIBED");

    const outsiderCh = (await authedRealtime(outsider)).channel(
      conversationChannelName(conversationId),
      { config: { private: true } },
    );
    openChannels.push(outsiderCh);
    expect(await subscribeStatus(outsiderCh)).toBe("CHANNEL_ERROR");
  }, 60_000);
});

// Resolve with the first broadcast of `event` on `channel`, or reject.
function nextBroadcast(
  channel: RealtimeChannel,
  event: string,
  timeoutMs = 20_000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no "${event}" broadcast within ${timeoutMs}ms`)),
      timeoutMs,
    );
    channel.on("broadcast", { event }, ({ payload }) => {
      clearTimeout(timer);
      resolve(payload as Record<string, unknown>);
    });
  });
}

describe("messaging realtime: database-sent broadcasts", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let eventId: string;
  let conversationId: string;
  const openChannels: RealtimeChannel[] = [];

  // sendMessageCore's notification fan-out uses its own service client.
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

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
  });

  afterEach(async () => {
    for (const ch of openChannels.splice(0)) {
      try {
        await ch.unsubscribe();
      } catch {
        /* ignore */
      }
    }
    for (const u of [organizer, member, outsider])
      u.client.realtime.disconnect();
    await deleteTestEvent(service, eventId);
    for (const u of [organizer, member, outsider]) {
      await deleteTestUser(service, u.id);
    }
  });

  async function join(user: TestUser, topic: string) {
    const ch = (await authedRealtime(user)).channel(topic, {
      config: { private: true },
    });
    openChannels.push(ch);
    return ch;
  }

  it("a new message reaches the other participant's thread channel as ids only, and their inbox as a last-message bump", async () => {
    const thread = await join(
      organizer,
      conversationChannelName(conversationId),
    );
    const inbox = await join(organizer, userInboxChannelName(organizer.id));
    const gotInsert = nextBroadcast(
      thread,
      MESSAGING_BROADCAST_EVENTS.messageInsert,
    );
    const gotBump = nextBroadcast(
      inbox,
      MESSAGING_INBOX_EVENTS.conversationUpdate,
    );
    expect(await subscribeStatus(thread)).toBe("SUBSCRIBED");
    expect(await subscribeStatus(inbox)).toBe("SUBSCRIBED");

    const body = "Is there parking at the venue?";
    const sent = await sendMessageCore(member.client, member.id, {
      conversationId,
      content: body,
      messageType: "text",
    });
    expect(sent.status).toBe(200);
    const messageId = sent.data?.message.id;

    const insert = await gotInsert;
    expect(insert).toMatchObject({
      id: messageId,
      conversation_id: conversationId,
      sender_id: member.id,
      message_type: "text",
    });
    // The body never rides the channel: clients refetch through RLS.
    expect(JSON.stringify(insert)).not.toContain(body);

    const bump = await gotBump;
    expect(bump).toMatchObject({
      id: conversationId,
      last_message_sender_id: member.id,
    });
    expect(typeof bump.last_message_preview).toBe("string");
  }, 90_000);

  it("a reaction arrives in the {eventType, new, old} shape the shared reducer reads", async () => {
    const sent = await sendMessageCore(organizer.client, organizer.id, {
      conversationId,
      content: "Yes, behind the hall.",
      messageType: "text",
    });
    const messageId = sent.data?.message.id as string;

    const thread = await join(
      organizer,
      conversationChannelName(conversationId),
    );
    const gotReaction = nextBroadcast(
      thread,
      MESSAGING_BROADCAST_EVENTS.reaction,
    );
    expect(await subscribeStatus(thread)).toBe("SUBSCRIBED");

    const { error } = await member.client.rpc("toggle_message_reaction", {
      p_message_id: messageId,
      p_emoji: "👍",
    });
    expect(error).toBeNull();

    // Realtime adds its own `id` to every database-sent broadcast.
    expect(await gotReaction).toMatchObject({
      eventType: "INSERT",
      new: { message_id: messageId, user_id: member.id, emoji: "👍" },
      old: {},
    });
  }, 90_000);

  it("an inbox channel admits only its owner", async () => {
    const own = await join(member, userInboxChannelName(member.id));
    expect(await subscribeStatus(own)).toBe("SUBSCRIBED");

    const someoneElses = await join(outsider, userInboxChannelName(member.id));
    expect(await subscribeStatus(someoneElses)).toBe("CHANNEL_ERROR");
  }, 60_000);
});
