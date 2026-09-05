import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// SEC-001 (docs/audit/01-limitations-register.md): 13 SECURITY DEFINER RPCs
// self-authorize via auth.uid() inside the function body rather than RLS or
// per-function grants. This file proves 6 of them actually enforce that for
// an organizer's event/ledger data -- create_ticket_checkout's and
// issue_tickets_for_checkout's own checks are covered in authz.integration
// .test.ts, and the 4 pure admin/staff self-identity checks are covered in
// sec001-self-identity.integration.test.ts. request_organizer_payout is
// covered here too (7 total).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("SEC-001: organizer-scoped SECURITY DEFINER functions", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let attacker: TestUser;
  let eventId: string;
  let payoutAccountId: string;

  beforeEach(async () => {
    service = getServiceClient();
    organizer = await createTestUser(service);
    attacker = await createTestUser(service);

    const fixture = await createTestEventWithTicketType(service, organizer.id, {
      quantity: 10,
      price: 50,
    });
    eventId = fixture.eventId;

    // A real ticket_checkout row, created through the actual RPC (not a
    // hand-rolled insert) so its shape matches a genuine purchase.
    const { data: checkoutSessionId, error: checkoutError } =
      await organizer.client.rpc("create_ticket_checkout", {
        p_user_id: organizer.id,
        p_event_id: eventId,
        p_occurrence_id: null,
        p_promo_code_id: null,
        p_promo_code_text: null,
        p_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        p_lines: [
          {
            ticket_type_id: fixture.ticketTypeId,
            quantity: 1,
            unit_price: 50,
            discount: 0,
            discounted_units: 0,
            amount: 50,
          },
        ],
        // Same generated-type gap create_event's fixture helper documents.
      } as unknown as Database["public"]["Functions"]["create_ticket_checkout"]["Args"]);
    if (checkoutError || !checkoutSessionId) {
      throw new Error(`Fixture setup failed: ${checkoutError?.message}`);
    }
    const { data: checkoutRows, error: checkoutRowsError } = await service
      .from("ticket_checkout")
      .select("id")
      .eq("checkout_session_id", checkoutSessionId);
    if (checkoutRowsError || !checkoutRows?.[0]) {
      throw new Error(
        `Fixture setup failed to look up ticket_checkout row: ${checkoutRowsError?.message}`,
      );
    }
    const ticketCheckoutId = checkoutRows[0].id;

    // A real transaction + refund_hold ledger entry, so get_event_refund_
    // breakdown / get_organizer_refund_breakdown / get_organizer_ledger_
    // transactions have real cross-organizer data that must NOT leak.
    const { data: transactionRow, error: transactionError } = await service
      .from("transaction")
      .insert({
        user_id: organizer.id,
        full_name: "Test Buyer",
        email: "test-buyer@example.test",
        reason: "Ticket_Purchase",
        amount: 50,
        currency: "GHS",
        status: "refund_pending",
        paystack_reference: `test-${crypto.randomUUID()}`,
      })
      .select("id")
      .single();
    if (transactionError || !transactionRow) {
      throw new Error(`Fixture setup failed: ${transactionError?.message}`);
    }

    const { error: ledgerError } = await service
      .from("organizer_ledger_entry")
      .insert([
        {
          organizer_id: organizer.id,
          event_id: eventId,
          ticket_checkout_id: ticketCheckoutId,
          entry_type: "earning",
          amount: 50,
          gross_amount: 50,
          fee_amount: 0,
          currency: "GHS",
        },
        {
          organizer_id: organizer.id,
          event_id: eventId,
          ticket_checkout_id: ticketCheckoutId,
          transaction_id: transactionRow.id,
          entry_type: "refund_hold",
          amount: -50,
          currency: "GHS",
        },
      ]);
    if (ledgerError) {
      throw new Error(`Fixture setup failed: ${ledgerError.message}`);
    }

    const { data: payoutAccountRow, error: payoutAccountError } = await service
      .from("payout_account")
      .insert({
        organizer_id: organizer.id,
        account_type: "mobile_money",
        account_holder_name: "Test Organizer",
        account_number: "0000000000",
      })
      .select("id")
      .single();
    if (payoutAccountError || !payoutAccountRow) {
      throw new Error(`Fixture setup failed: ${payoutAccountError?.message}`);
    }
    payoutAccountId = payoutAccountRow.id;
  });

  afterEach(async () => {
    // Cascades clean up ticket_checkout (via event) and organizer_ledger_
    // entry/payout_account/transaction (via user_info), same as elsewhere
    // in this suite -- no manual row cleanup needed.
    await deleteTestEvent(service, eventId);
    await deleteTestUser(service, attacker.id);
    await deleteTestUser(service, organizer.id);
  });

  it("cancel_event_and_release_tickets rejects a non-owner", async () => {
    const { error } = await attacker.client.rpc(
      "cancel_event_and_release_tickets",
      { p_event_id: eventId },
    );
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/not (found|owned)/i);
  });

  it("get_event_attendee_contacts rejects a non-owner (would otherwise leak attendee emails/phones)", async () => {
    const { error } = await attacker.client.rpc("get_event_attendee_contacts", {
      p_event_id: eventId,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/not authorized/i);
  });

  it("get_event_cancellation_impact rejects a non-owner", async () => {
    const { error } = await attacker.client.rpc(
      "get_event_cancellation_impact",
      { p_event_id: eventId },
    );
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/not (found|owned)/i);
  });

  it("get_event_refund_breakdown silently returns nothing for a non-owner instead of raising", async () => {
    const { data: ownerData, error: ownerError } = await organizer.client.rpc(
      "get_event_refund_breakdown",
      { p_event_id: eventId },
    );
    expect(ownerError).toBeNull();
    expect(ownerData).toHaveLength(1);
    expect(Number(ownerData?.[0]?.pending_refund_amount)).toBe(50);

    // This function RETURNs early with zero rows rather than raising --
    // unlike the others above, so this is the behavior to actually assert.
    const { data: attackerData, error: attackerError } =
      await attacker.client.rpc("get_event_refund_breakdown", {
        p_event_id: eventId,
      });
    expect(attackerError).toBeNull();
    expect(attackerData).toHaveLength(0);
  });

  it("get_organizer_ledger_transactions only ever returns the caller's own entries", async () => {
    const { data: ownerData, error: ownerError } = await organizer.client.rpc(
      "get_organizer_ledger_transactions",
      {
        p_cursor_created_at: null,
        p_cursor_id: null,
        p_limit: 20,
        // Same generated-type gap documented elsewhere in this suite.
      } as unknown as Database["public"]["Functions"]["get_organizer_ledger_transactions"]["Args"],
    );
    expect(ownerError).toBeNull();
    expect(ownerData?.length ?? 0).toBeGreaterThan(0);

    const { data: attackerData, error: attackerError } =
      await attacker.client.rpc("get_organizer_ledger_transactions", {
        p_cursor_created_at: null,
        p_cursor_id: null,
        p_limit: 20,
      } as unknown as Database["public"]["Functions"]["get_organizer_ledger_transactions"]["Args"]);
    expect(attackerError).toBeNull();
    expect(attackerData).toHaveLength(0);
  });

  it("get_organizer_refund_breakdown only ever returns the caller's own entries", async () => {
    const { data: ownerData, error: ownerError } = await organizer.client.rpc(
      "get_organizer_refund_breakdown",
    );
    expect(ownerError).toBeNull();
    expect(ownerData).toHaveLength(1);
    expect(Number(ownerData?.[0]?.pending_refund_amount)).toBe(50);

    const { data: attackerData, error: attackerError } =
      await attacker.client.rpc("get_organizer_refund_breakdown");
    expect(attackerError).toBeNull();
    expect(attackerData).toHaveLength(0);
  });

  it("request_organizer_payout rejects a payout account owned by someone else", async () => {
    const { error } = await attacker.client.rpc("request_organizer_payout", {
      p_payout_account_id: payoutAccountId,
      p_amount: 10,
      p_currency: "GHS",
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/invalid payout account/i);
  });
});
