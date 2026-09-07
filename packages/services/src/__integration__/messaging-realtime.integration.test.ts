import { conversationChannelName } from "@abonten/core/messagingRealtime";
import { openConversationCore } from "@abonten/services/messaging/openConversationCore";
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
// The postgres_changes *delivery* path (participant receives a new-message
// event, non-participant doesn't) is exercised against a real device client
// in the Phase 4 / Phase 5 manual pass rather than here — a WAL-timing
// assertion is too flaky for the CI unit suite, and the RLS that scopes it
// is the same `message_participant_select` policy already covered by
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

async function authedRealtime(
  user: TestUser,
): Promise<SupabaseClient<Database>> {
  // The header-only test client has no auth session, so realtime would
  // otherwise connect as `anon`. Push the user's JWT into the socket and
  // wait for it to be applied before opening a channel.
  await user.client.realtime.setAuth(user.accessToken);
  return user.client;
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
    member.client.realtime.disconnect();
    outsider.client.realtime.disconnect();
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
