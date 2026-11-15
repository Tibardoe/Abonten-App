import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Send a ticket to a friend (docs/architecture/ticket-transfers.md): the
// offer, the move with a new code, the attendee row following the ticket,
// the move limit, the free-ticket rule (X38), offers ended by a check-in or
// by time, the receiver chosen by phone, and the refund guards for a ticket
// someone else paid for. The new QR upload is replaced so nothing reaches
// Cloudinary.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../tickets/saveEventQrCodeToCloudinary", () => ({
  saveEventQrCodeToCloudinary: async (_qr: string, filename: string) => ({
    public_id: `test/qr-${filename}`,
    version: 1,
  }),
}));
vi.mock("../media/assetReferences", () => ({
  destroyAssetIfUnused: async () => ({ result: "ok" }),
}));
// The invite text to a number with no account: nothing leaves the machine,
// and a test chooses whether the provider takes it.
const sms = vi.hoisted(() => ({ accept: false, sent: 0 }));
vi.mock("../sms/hubtelSms", () => ({
  sendHubtelSms: async () => {
    if (!sms.accept) {
      return { ok: false, reason: "unreachable", detail: "test" };
    }
    sms.sent += 1;
    return { ok: true, messageId: null };
  },
}));

import { isValidNewTicketCode } from "@abonten/core/ticketTransfers/ticketCode";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  acceptTicketTransferCore,
  cancelTicketTransferCore,
  declineTicketTransferCore,
  getTicketTransferStateCore,
  listIncomingTicketTransfersCore,
  sendTicketCore,
  setEventTicketTransferSettingCore,
} from "../ticketTransfers/ticketTransferCore";
import { resetTicketTransferSettingsCache } from "../ticketTransfers/ticketTransferProgram";
import { cancelUserTicketCore } from "../tickets/cancelUserTicketCore";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const noText = { canTextNumber: async () => false };

describe("ticket transfers", () => {
  let service: SupabaseClient<Database>;
  let svc: ServiceRoleClient;
  let organizer: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let dan: TestUser;
  let eventId: string;
  let ticketTypeId: string;
  const users: TestUser[] = [];
  const transactions: string[] = [];

  async function user(): Promise<TestUser> {
    const u = await createTestUser(service);
    users.push(u);
    // A username to be found by.
    await service
      .from("user_info")
      .update({ username: `tt_${u.id.slice(0, 8)}`, full_name: "Test Person" })
      .eq("id", u.id);
    return u;
  }

  async function issue(
    holder: TestUser,
    opts: { paidBy?: TestUser } = {},
  ): Promise<{ id: string; code: string }> {
    let transactionId: string | null = null;
    let checkoutId: string | null = null;
    if (opts.paidBy) {
      // A paid ticket has its checkout line; a fixture without one would
      // count as a free registration (one per person).
      const { data: line, error: lineError } = await service
        .from("ticket_checkout")
        .insert({
          user_id: opts.paidBy.id,
          event_id: eventId,
          ticket_type_id: ticketTypeId,
          quantity: 1,
          unit_price: 20,
          total_price: 20,
          status: "paid",
          checkout_session_id: crypto.randomUUID(),
        })
        .select("id")
        .single();
      if (lineError) throw new Error(lineError.message);
      checkoutId = line.id;
      const { data, error } = await service
        .from("transaction")
        .insert({
          user_id: opts.paidBy.id,
          full_name: "Buyer",
          email: opts.paidBy.email,
          reason: "Ticket_Purchase",
          amount: 20,
          currency: "GHS",
          status: "successful",
          payment_method: "paystack",
          provider: "paystack",
          provider_reference: `TT-${crypto.randomUUID()}`,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      transactionId = data.id;
      transactions.push(data.id);
    }
    const code = `TKT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const { data, error } = await service
      .from("ticket")
      .insert({
        user_id: holder.id,
        ticket_type_id: ticketTypeId,
        transaction_id: transactionId,
        ticket_checkout_id: checkoutId,
        status: "active",
        ticket_code: code,
        qr_public_id: "test/qr",
        qr_version: "1",
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await service.from("attendance").insert({
      user_id: holder.id,
      event_id: eventId,
      ticket_type_id: ticketTypeId,
      ticket_id: data.id,
      status: "attending",
      number_of_tickets: 1,
      name: "Buyer Name",
      email: "buyer@example.com",
    });
    return { id: data.id, code };
  }

  async function setProgram(enabled: boolean) {
    await service
      .from("ticket_transfer_program_setting")
      .update({ enabled, audience: "all" })
      .eq("id", 1);
    resetTicketTransferSettingsCache();
  }

  const username = (u: TestUser) => `tt_${u.id.slice(0, 8)}`;

  beforeAll(async () => {
    service = getServiceClient();
    svc = service as unknown as ServiceRoleClient;
    organizer = await user();
    [alice, bob, carol, dan] = await Promise.all([
      user(),
      user(),
      user(),
      user(),
    ]);
    ({ eventId, ticketTypeId } = await createTestEventWithTicketType(
      service,
      organizer.id,
      { quantity: 50, price: 20 },
    ));
    await setProgram(true);
  });

  afterAll(async () => {
    await setProgram(false);
    await service.from("ticket_transfer").delete().eq("event_id", eventId);
    await service.from("attendance").delete().eq("event_id", eventId);
    await service.from("ticket").delete().eq("ticket_type_id", ticketTypeId);
    await service.from("ticket_checkout").delete().eq("event_id", eventId);
    for (const id of transactions) {
      await service.from("transaction").delete().eq("id", id);
    }
    await deleteTestEvent(service, eventId).catch(() => undefined);
    await Promise.all(users.map((u) => deleteTestUser(service, u.id)));
  });

  it("ships switched off: no send while the programme is off", async () => {
    await setProgram(false);
    const ticket = await issue(alice, { paidBy: alice });
    const res = await sendTicketCore(
      svc,
      alice.id,
      {
        ticketId: ticket.id,
        target: { kind: "username", username: username(bob) },
      },
      noText,
    );
    expect(res.status).toBe(403);
    await setProgram(true);
  });

  it("moves the ticket only on accept, with a new code, and the attendee row follows", async () => {
    const ticket = await issue(alice, { paidBy: alice });
    const sent = await sendTicketCore(
      svc,
      alice.id,
      {
        ticketId: ticket.id,
        target: { kind: "username", username: `@${username(bob)}` },
      },
      noText,
    );
    expect(sent.status).toBe(200);
    if (sent.status !== 200) return;
    expect(sent.data.status).toBe("pending");

    // Still Alice's until Bob accepts; Bob sees it waiting.
    const before = await service
      .from("ticket")
      .select("user_id")
      .eq("id", ticket.id)
      .single();
    expect(before.data?.user_id).toBe(alice.id);
    const incoming = await listIncomingTicketTransfersCore(svc, bob.id);
    expect(incoming.status === 200 && incoming.data.map((o) => o.id)).toContain(
      sent.data.id,
    );

    // A second offer on the same ticket is refused.
    const again = await sendTicketCore(
      svc,
      alice.id,
      {
        ticketId: ticket.id,
        target: { kind: "username", username: username(carol) },
      },
      noText,
    );
    expect(again.status).toBe(409);

    // Carol cannot take what was sent to Bob.
    const wrong = await acceptTicketTransferCore(svc, carol.id, sent.data.id);
    expect(wrong.status).toBe(404);

    const accepted = await acceptTicketTransferCore(svc, bob.id, sent.data.id);
    expect(accepted.status).toBe(200);

    const after = await service
      .from("ticket")
      .select("user_id, issued_to, ticket_code, transfer_count, qr_public_id")
      .eq("id", ticket.id)
      .single();
    expect(after.data?.user_id).toBe(bob.id);
    expect(after.data?.issued_to).toBe(alice.id);
    expect(after.data?.transfer_count).toBe(1);
    expect(after.data?.ticket_code).not.toBe(ticket.code);
    expect(isValidNewTicketCode(after.data?.ticket_code ?? "")).toBe(true);

    const attendance = await service
      .from("attendance")
      .select("user_id, email, name")
      .eq("ticket_id", ticket.id)
      .single();
    expect(attendance.data?.user_id).toBe(bob.id);
    expect(attendance.data?.email).toBeNull();

    // Alice is told it was accepted.
    const { data: notes } = await service
      .from("notification")
      .select("type")
      .eq("user_id", alice.id)
      .eq("type", "ticket_transfer_accepted");
    expect(notes?.length).toBeGreaterThan(0);
  });

  it("a ticket someone else paid for is sent back, not refunded by its holder", async () => {
    const ticket = await issue(alice, { paidBy: alice });
    const sent = await sendTicketCore(
      svc,
      alice.id,
      {
        ticketId: ticket.id,
        target: { kind: "username", username: username(bob) },
      },
      noText,
    );
    if (sent.status !== 200) throw new Error("send failed");
    await acceptTicketTransferCore(svc, bob.id, sent.data.id);
    const res = await cancelUserTicketCore(bob.client, bob.id, ticket.id, null);
    expect(res.status).toBe(409);
    const { data } = await service
      .from("ticket")
      .select("status")
      .eq("id", ticket.id)
      .single();
    expect(data?.status).toBe("active");
  });

  it("decline and take-back leave the ticket with its sender", async () => {
    const ticket = await issue(alice, { paidBy: alice });
    const first = await sendTicketCore(
      svc,
      alice.id,
      {
        ticketId: ticket.id,
        target: { kind: "username", username: username(bob) },
      },
      noText,
    );
    if (first.status !== 200) throw new Error("send failed");
    expect(
      (await declineTicketTransferCore(svc, bob.id, first.data.id)).status,
    ).toBe(200);

    const second = await sendTicketCore(
      svc,
      alice.id,
      {
        ticketId: ticket.id,
        target: { kind: "username", username: username(carol) },
      },
      noText,
    );
    if (second.status !== 200) throw new Error("send failed");
    // Only the sender can take it back.
    expect(
      (await cancelTicketTransferCore(svc, carol.id, second.data.id)).status,
    ).toBe(404);
    expect(
      (await cancelTicketTransferCore(svc, alice.id, second.data.id)).status,
    ).toBe(200);
    // An ended offer cannot be accepted any more.
    expect(
      (await acceptTicketTransferCore(svc, carol.id, second.data.id)).status,
    ).toBe(409);

    const { data } = await service
      .from("ticket")
      .select("user_id, ticket_code")
      .eq("id", ticket.id)
      .single();
    expect(data?.user_id).toBe(alice.id);
    expect(data?.ticket_code).toBe(ticket.code);
  });

  it("a check-in ends an open offer", async () => {
    const ticket = await issue(alice, { paidBy: alice });
    const sent = await sendTicketCore(
      svc,
      alice.id,
      {
        ticketId: ticket.id,
        target: { kind: "username", username: username(bob) },
      },
      noText,
    );
    if (sent.status !== 200) throw new Error("send failed");
    await service
      .from("ticket")
      .update({ status: "used", used_at: new Date().toISOString() })
      .eq("id", ticket.id);
    const { data } = await service
      .from("ticket_transfer")
      .select("status, cancel_reason")
      .eq("id", sent.data.id)
      .single();
    expect(data).toEqual({
      status: "cancelled",
      cancel_reason: "ticket_changed",
    });
  });

  it("an offer past its deadline expires and the sender is told", async () => {
    const ticket = await issue(alice, { paidBy: alice });
    const sent = await sendTicketCore(
      svc,
      alice.id,
      {
        ticketId: ticket.id,
        target: { kind: "username", username: username(dan) },
      },
      noText,
    );
    if (sent.status !== 200) throw new Error("send failed");
    await service
      .from("ticket_transfer")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", sent.data.id);
    const { error } = await service.rpc("ticket_transfer_expire_due");
    expect(error).toBeNull();
    const { data } = await service
      .from("ticket_transfer")
      .select("status")
      .eq("id", sent.data.id)
      .single();
    expect(data?.status).toBe("expired");
    const { data: notes } = await service
      .from("notification")
      .select("data")
      .eq("user_id", alice.id)
      .eq("type", "ticket_transfer_expired");
    expect(notes?.length).toBeGreaterThan(0);
  });

  it("a ticket moves at most three times", async () => {
    const ticket = await issue(alice, { paidBy: alice });
    const chain = [alice, bob, carol, dan];
    for (let i = 0; i < 3; i++) {
      const sent = await sendTicketCore(
        svc,
        chain[i].id,
        {
          ticketId: ticket.id,
          target: { kind: "username", username: username(chain[i + 1]) },
        },
        noText,
      );
      expect(sent.status).toBe(200);
      if (sent.status !== 200) return;
      expect(
        (await acceptTicketTransferCore(svc, chain[i + 1].id, sent.data.id))
          .status,
      ).toBe(200);
    }
    const state = await getTicketTransferStateCore(svc, dan.id, ticket.id);
    expect(state.status === 200 && state.data.block).toBe("too_many_moves");
    const fourth = await sendTicketCore(
      svc,
      dan.id,
      {
        ticketId: ticket.id,
        target: { kind: "username", username: username(alice) },
      },
      noText,
    );
    expect(fourth.status).toBe(409);
  });

  it("the organizer can switch sending off for the event", async () => {
    const ticket = await issue(alice, { paidBy: alice });
    expect(
      (await setEventTicketTransferSettingCore(svc, alice.id, eventId, false))
        .status,
    ).toBe(404);
    expect(
      (
        await setEventTicketTransferSettingCore(
          svc,
          organizer.id,
          eventId,
          false,
        )
      ).status,
    ).toBe(200);
    const res = await sendTicketCore(
      svc,
      alice.id,
      {
        ticketId: ticket.id,
        target: { kind: "username", username: username(bob) },
      },
      noText,
    );
    expect(res.status).toBe(409);
    await setEventTicketTransferSettingCore(svc, organizer.id, eventId, true);
  });

  it("switching sending off closes the offers still waiting, and both sides are told", async () => {
    const ticket = await issue(alice, { paidBy: alice });
    const sent = await sendTicketCore(
      svc,
      alice.id,
      {
        ticketId: ticket.id,
        target: { kind: "username", username: username(bob) },
      },
      noText,
    );
    expect(sent.status).toBe(200);
    if (sent.status !== 200) return;

    expect(
      (
        await setEventTicketTransferSettingCore(
          svc,
          organizer.id,
          eventId,
          false,
        )
      ).status,
    ).toBe(200);
    const { data: row } = await service
      .from("ticket_transfer")
      .select("status, cancel_reason")
      .eq("id", sent.data.id)
      .single();
    expect(row).toEqual({
      status: "cancelled",
      cancel_reason: "organizer_off",
    });
    expect(
      (await acceptTicketTransferCore(svc, bob.id, sent.data.id)).status,
    ).toBe(409);
    const { data: held } = await service
      .from("ticket")
      .select("user_id")
      .eq("id", ticket.id)
      .single();
    expect(held?.user_id).toBe(alice.id);

    const { data: notices } = await service
      .from("notification")
      .select("user_id, type")
      .in("type", [
        "ticket_transfer_stopped_sender",
        "ticket_transfer_stopped_receiver",
      ])
      .in("user_id", [alice.id, bob.id]);
    expect(notices).toEqual(
      expect.arrayContaining([
        { user_id: alice.id, type: "ticket_transfer_stopped_sender" },
        { user_id: bob.id, type: "ticket_transfer_stopped_receiver" },
      ]),
    );

    // An offer that slipped in some other way still cannot be accepted
    // while sending is off.
    const { data: raw } = await service
      .from("ticket_transfer")
      .insert({
        ticket_id: ticket.id,
        event_id: eventId,
        from_user_id: alice.id,
        to_user_id: bob.id,
        from_code: ticket.code,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .select("id")
      .single();
    const late = await acceptTicketTransferCore(svc, bob.id, raw?.id ?? "");
    expect(late.status).toBe(409);
    await service
      .from("ticket_transfer")
      .delete()
      .eq("id", raw?.id ?? "");
    await setEventTicketTransferSettingCore(svc, organizer.id, eventId, true);
  });

  it("the sender sees when the invite text to a number did not go", async () => {
    const number = () =>
      `+23320${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    const canText = { canTextNumber: async () => true };

    sms.accept = false;
    const first = await issue(alice, { paidBy: alice });
    const failed = await sendTicketCore(
      svc,
      alice.id,
      { ticketId: first.id, target: { kind: "phone", phone: number() } },
      canText,
    );
    expect(failed.status).toBe(200);
    if (failed.status !== 200) return;
    expect(failed.data.to).toBeNull();
    expect(failed.data.toPhoneTexted).toBe(false);

    sms.accept = true;
    const second = await issue(alice, { paidBy: alice });
    const texted = await sendTicketCore(
      svc,
      alice.id,
      { ticketId: second.id, target: { kind: "phone", phone: number() } },
      canText,
    );
    sms.accept = false;
    expect(texted.status).toBe(200);
    if (texted.status !== 200) return;
    expect(texted.data.toPhoneTexted).toBe(true);
    expect(sms.sent).toBe(1);

    for (const id of [failed.data.id, texted.data.id]) {
      await cancelTicketTransferCore(svc, alice.id, id);
    }
  });

  it("someone who blocked the sender cannot be sent a ticket", async () => {
    const ticket = await issue(alice, { paidBy: alice });
    await service.from("conversation_block").insert({
      blocker_id: carol.id,
      blocked_id: alice.id,
      conversation_id: null,
    });
    const res = await sendTicketCore(
      svc,
      alice.id,
      {
        ticketId: ticket.id,
        target: { kind: "username", username: username(carol) },
      },
      noText,
    );
    expect(res.status).toBe(409);
    await service
      .from("conversation_block")
      .delete()
      .eq("blocker_id", carol.id)
      .eq("blocked_id", alice.id);
  });

  it("a number with an account goes to that account; a phone offer is accepted by the verified number", async () => {
    const phone = `+23324${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
    const holderOfNumber = await user();
    await service.auth.admin.updateUserById(holderOfNumber.id, {
      phone: phone.slice(1),
      phone_confirm: true,
    });
    const ticket = await issue(alice, { paidBy: alice });
    const sent = await sendTicketCore(
      svc,
      alice.id,
      { ticketId: ticket.id, target: { kind: "phone", phone } },
      noText,
    );
    expect(sent.status).toBe(200);
    if (sent.status !== 200) return;
    expect(sent.data.to?.id).toBe(holderOfNumber.id);

    // An offer kept for a number (as when it had no account yet) is
    // accepted only by the account whose verified phone it is.
    const other = await issue(alice, { paidBy: alice });
    const { data: raw } = await service
      .from("ticket_transfer")
      .insert({
        ticket_id: other.id,
        event_id: eventId,
        from_user_id: alice.id,
        to_phone: phone,
        from_code: other.code,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .select("id")
      .single();
    expect(
      (await acceptTicketTransferCore(svc, bob.id, raw?.id ?? "")).status,
    ).toBe(404);
    expect(
      (await acceptTicketTransferCore(svc, holderOfNumber.id, raw?.id ?? ""))
        .status,
    ).toBe(200);
  });

  it("a free ticket you sent still counts as yours (X38)", async () => {
    const { eventId: freeEvent } = await createTestEventWithTicketType(
      service,
      organizer.id,
      { quantity: 10, price: 0 },
    );
    try {
      await service
        .from("ticket_type")
        .update({ type: "FREE" })
        .eq("event_id", freeEvent);
      const giver = await user();
      const taker = await user();
      const issueFree = (u: TestUser, code: string) =>
        service.rpc("issue_free_ticket", {
          p_user_id: u.id,
          p_event_id: freeEvent,
          p_occurrence_id: null as unknown as string,
          p_ticket_code: code,
          p_qr_public_id: "test/qr",
          p_qr_version: "1",
          p_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        });
      const first = await issueFree(
        giver,
        `TKT-${crypto.randomUUID().slice(0, 8)}`,
      );
      expect(first.error).toBeNull();
      const ticketId = first.data as unknown as string;

      const sent = await sendTicketCore(
        svc,
        giver.id,
        { ticketId, target: { kind: "username", username: username(taker) } },
        noText,
      );
      expect(sent.status).toBe(200);
      if (sent.status !== 200) return;
      expect(
        (await acceptTicketTransferCore(svc, taker.id, sent.data.id)).status,
      ).toBe(200);

      // The giver cannot register again, and the taker cannot hold two.
      const again = await issueFree(
        giver,
        `TKT-${crypto.randomUUID().slice(0, 8)}`,
      );
      expect(again.error?.message).toMatch(/already/i);
      const second = await issueFree(
        taker,
        `TKT-${crypto.randomUUID().slice(0, 8)}`,
      );
      expect(second.error?.message).toMatch(/already/i);
    } finally {
      await service.from("ticket_transfer").delete().eq("event_id", freeEvent);
      await service.from("attendance").delete().eq("event_id", freeEvent);
      const { data: types } = await service
        .from("ticket_type")
        .select("id")
        .eq("event_id", freeEvent);
      for (const t of types ?? []) {
        await service.from("ticket").delete().eq("ticket_type_id", t.id);
      }
      await deleteTestEvent(service, freeEvent).catch(() => undefined);
    }
  });

  it("the apps cannot read offers or call the transfer functions", async () => {
    const read = await alice.client.from("ticket_transfer").select("id");
    expect(read.data ?? []).toEqual([]);
    const call = await alice.client.rpc("ticket_transfer_send", {
      p_ticket_id: crypto.randomUUID(),
      p_from_user_id: alice.id,
      p_to_user_id: bob.id,
      p_to_phone: null,
    });
    expect(call.error).not.toBeNull();
    const lookup = await alice.client.rpc("ticket_transfer_user_by_phone", {
      p_phone: "+233241234567",
    });
    expect(lookup.error).not.toBeNull();
  });
});
