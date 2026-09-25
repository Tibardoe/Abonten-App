import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Production gate (2026-09-25): what a banned account can still do with the
// access token it held when it was banned. A ban revokes its sessions, but
// an access token already issued stays valid until it expires (up to an
// hour). The web middleware and the mobile API refuse restricted accounts
// on every request, so the only path left is the Data API / RPCs directly
// with that token — which is what this test uses. It records every
// operation's outcome and asserts that nothing that touches another person,
// money or someone else's data still works.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

type Outcome = "allowed" | "blocked";

describe("banned account, token still valid", () => {
  let service: SupabaseClient<Database>;
  let banned: TestUser;
  let other: TestUser;
  let ownEventId: string;
  let otherEventId: string;
  let conversationId: string | null = null;
  const results: Record<string, Outcome> = {};

  beforeAll(async () => {
    service = getServiceClient();
    [banned, other] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
    ]);
    ({ eventId: ownEventId } = await createTestEventWithTicketType(
      service,
      banned.id,
      { quantity: 5, price: 10 },
    ));
    ({ eventId: otherEventId } = await createTestEventWithTicketType(
      service,
      other.id,
      { quantity: 5, price: 10 },
    ));
    // Before the ban: a conversation with the other organizer's event.
    const { data, error } = await banned.client.rpc("open_conversation", {
      p_type: "event",
      p_event_id: otherEventId,
      p_place_id: null,
    } as never);
    if (error) throw new Error(`open_conversation: ${error.message}`);
    conversationId = data as unknown as string;
    // The ban (what setUserStatusCore records).
    await service
      .from("user_info")
      .update({ status_id: 3 })
      .eq("id", banned.id);
  });

  afterAll(async () => {
    for (const id of [ownEventId, otherEventId]) {
      await deleteTestEvent(service, id).catch(() => undefined);
    }
    await Promise.all(
      [banned, other].map((u) => deleteTestUser(service, u.id)),
    );
  });

  async function attempt(
    name: string,
    run: () => PromiseLike<{ error: unknown; data?: unknown }>,
    changed?: () => Promise<boolean>,
  ) {
    const { error } = await run();
    const wrote = changed ? await changed() : !error;
    results[name] = wrote ? "allowed" : "blocked";
  }

  it("classifies every operation and blocks the sensitive ones", async () => {
    const c = banned.client;
    if (conversationId) {
      await attempt("send a message", () =>
        c.rpc("send_message", {
          p_conversation_id: conversationId,
          p_content: "still here",
          p_client_generated_id: crypto.randomUUID(),
          p_reply_to_message_id: null,
          p_message_type: "text",
          p_attachments: [],
        } as never),
      );
    }
    await attempt("open a new conversation", () =>
      c.rpc("open_conversation", {
        p_type: "support",
        p_event_id: null,
        p_place_id: null,
      } as never),
    );
    await attempt(
      "edit own event",
      () =>
        c
          .from("event")
          .update({ description: "edited while banned" })
          .eq("id", ownEventId),
      async () => {
        const { data } = await service
          .from("event")
          .select("description")
          .eq("id", ownEventId)
          .single();
        return data?.description === "edited while banned";
      },
    );
    await attempt(
      "cancel own event (refunds buyers)",
      () =>
        c.rpc("cancel_event_and_release_tickets", {
          p_event_id: ownEventId,
        }),
      async () => {
        const { data } = await service
          .from("event")
          .select("status")
          .eq("id", ownEventId)
          .single();
        return data?.status === "canceled";
      },
    );
    await attempt("read own attendees' emails and phones", () =>
      c.rpc("get_event_attendee_contacts", { p_event_id: ownEventId }),
    );
    await attempt("post an event review", () =>
      c.from("event_review").insert({
        event_id: otherEventId,
        reviewer_id: banned.id,
        rating: 1,
        comment: "revenge",
      } as never),
    );
    await attempt("report someone", () =>
      c.from("report").insert({
        reporter_id: banned.id,
        target_type: "event",
        target_id: otherEventId,
        category: "spam",
        dedupe_key: `banned:${crypto.randomUUID()}`,
      } as never),
    );
    await attempt("request a payout", () =>
      c.rpc("request_organizer_payout", {
        p_payout_account_id: crypto.randomUUID(),
        p_amount: 10,
        p_currency: "GHS",
      }),
    );
    await attempt(
      "change own profile name",
      () =>
        c
          .from("user_info")
          .update({ full_name: "Renamed while banned" })
          .eq("id", banned.id),
      async () => {
        const { data } = await service
          .from("user_info")
          .select("full_name")
          .eq("id", banned.id)
          .single();
        return data?.full_name === "Renamed while banned";
      },
    );
    await attempt(
      "unban self",
      () =>
        c
          .from("user_info")
          .update({ status_id: 1 } as never)
          .eq("id", banned.id),
      async () => {
        const { data } = await service
          .from("user_info")
          .select("status_id")
          .eq("id", banned.id)
          .single();
        return data?.status_id === 1;
      },
    );
    await attempt("save a favourite", () =>
      c.from("favorite").insert({ user_id: banned.id, event_id: otherEventId }),
    );
    await attempt("register a push token", () =>
      c.from("device_token").insert({
        user_id: banned.id,
        token: `ExponentPushToken[${crypto.randomUUID()}]`,
        platform: "android",
      } as never),
    );
    await attempt("block someone", () =>
      c.rpc("user_block_set", { p_blocked_id: other.id, p_block: true }),
    );

    console.log(
      `\nBANNED-TOKEN WINDOW\n${Object.entries(results)
        .map(([k, v]) => `  ${v === "allowed" ? "ALLOWED" : "blocked"}  ${k}`)
        .join("\n")}\n`,
    );

    // Anything that reaches another person, money or other people's data.
    const mustBeBlocked = [
      "send a message",
      "open a new conversation",
      "edit own event",
      "cancel own event (refunds buyers)",
      "read own attendees' emails and phones",
      "post an event review",
      "report someone",
      "request a payout",
      "change own profile name",
      "unban self",
    ];
    const leaks = mustBeBlocked.filter((k) => results[k] === "allowed");
    expect(leaks).toEqual([]);
  });
});
