import { createHmac } from "node:crypto";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack AND a Paystack TEST secret key — skipped
// otherwise:
//   PAYSTACK_SANDBOX_SECRET_KEY=sk_test_… npx vitest run \
//     --config vitest.integration.config.ts paystack-sandbox
// Only a test-mode key (sk_test_) enables it; a live key is never used.
//
// The Ghana money path against Paystack's real test API, nothing mocked:
// buy a ticket with a saved MTN mobile-money wallet (Paystack's documented
// test number), let Paystack settle the charge, verify it, issue the
// ticket, book the fee and the organizer's earning, refund the ticket price
// (fee retained) through Paystack's refund API, then deliver the signed
// refund.processed webhook Paystack sends and check every final state.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateCheckoutCore } from "../checkout/validateCheckoutCore";
import { invalidateMarketCache } from "../markets/marketConfig";
import { issueRefundCore } from "../organizer/issueRefundCore";
import { createMultiCheckoutPaymentAttemptCore } from "../payments/createMultiCheckoutPaymentAttemptCore";
import { finalizePayment } from "../payments/finalizePayment";
import type { PaymentFulfillmentDeps } from "../payments/fulfillmentDeps";
import { handleProviderWebhook } from "../payments/webhookCore";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const SANDBOX_KEY = process.env.PAYSTACK_SANDBOX_SECRET_KEY ?? "";
const enabled = SANDBOX_KEY.startsWith("sk_test_");
// Paystack's documented Ghana test wallet (MTN).
const TEST_WALLET = "+233551234987";

type Args<F extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][F]["Args"];

describe.skipIf(!enabled)(
  "Paystack sandbox — Ghana purchase and refund",
  () => {
    let service: SupabaseClient<Database>;
    let organizer: TestUser;
    let buyer: TestUser;
    let eventId: string;
    let ticketTypeId: string;
    const saved: Record<string, string | undefined> = {};

    const deps: PaymentFulfillmentDeps = {
      issueTickets: async (sessionId, transactionId, metadata, auth) => {
        const { data: rows } = await service
          .from("ticket_checkout")
          .select("id, ticket_type_id, quantity, status")
          .eq("checkout_session_id", sessionId)
          .eq("user_id", auth.userId);
        if ((rows ?? []).every((r) => r.status === "paid")) {
          return { status: 200 };
        }
        const tickets = (rows ?? []).flatMap((r) =>
          Array.from({ length: r.quantity }, () => ({
            checkout_id: r.id,
            ticket_type_id: r.ticket_type_id,
            ticket_code: `T-${crypto.randomUUID().slice(0, 10)}`,
            qr_public_id: "test/qr",
            qr_version: "1",
          })),
        );
        const { error } = await service.rpc("issue_tickets_for_checkout", {
          p_checkout_session_id: sessionId,
          p_user_id: auth.userId,
          p_transaction_id: transactionId,
          p_metadata: JSON.parse(metadata),
          p_ticket_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
          p_tickets: tickets,
        } as unknown as Args<"issue_tickets_for_checkout">);
        return error
          ? { status: 500, message: error.message }
          : { status: 200 };
      },
      activatePlacePromotion: async () => ({
        status: 500,
        message: "not used",
      }),
      activateEventPromotion: async () => ({
        status: 500,
        message: "not used",
      }),
    };

    beforeAll(async () => {
      service = getServiceClient();
      const { data: acct } = await service
        .from("market_payment_provider")
        .select("secret_key_env, webhook_secret_env")
        .eq("country_code", "GH")
        .eq("provider", "paystack")
        .single();
      for (const name of [
        acct?.secret_key_env as string,
        acct?.webhook_secret_env as string,
      ]) {
        saved[name] = process.env[name];
        // Paystack signs webhooks with the secret key itself.
        process.env[name] = SANDBOX_KEY;
      }
      invalidateMarketCache();
      [organizer, buyer] = await Promise.all([
        createTestUser(service),
        createTestUser(service),
      ]);
      ({ eventId, ticketTypeId } = await createTestEventWithTicketType(
        service,
        organizer.id,
        { quantity: 10, price: 50 },
      ));
    });

    afterAll(async () => {
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      invalidateMarketCache();
      await deleteTestEvent(service, eventId).catch(() => undefined);
      await Promise.all(
        [organizer, buyer].map((u) => deleteTestUser(service, u.id)),
      );
    });

    it("charges, fulfils, books, refunds and settles", async () => {
      const { data: wallet } = await service
        .from("payment_method")
        .insert({
          user_id: buyer.id,
          method_type: "momo",
          details: {
            networkCode: "MTN",
            networkName: "MTN",
            phone: TEST_WALLET,
          },
          status: "active",
        })
        .select("id")
        .single();
      const opened = await validateCheckoutCore(buyer.client, buyer.id, {
        eventId,
        quantities: { [ticketTypeId]: 1 },
      });
      expect(opened.status, opened.message).toBe(200);
      const sessionId = opened.checkoutSessionId as string;

      // 1. The charge: a real Paystack /charge call on the saved wallet.
      const started = await createMultiCheckoutPaymentAttemptCore(
        buyer.client,
        buyer.id,
        // Paystack refuses the .test domain; example.com is reserved (RFC 2606).
        `sandbox-${buyer.id.slice(0, 8)}@example.com`,
        {
          checkoutSessionIds: [sessionId],
          paymentMethodId: wallet?.id as string,
          platform: "web",
        },
        (id) => `https://example.test/checkout/${id}`,
        deps,
      );
      expect(started.status, JSON.stringify(started)).toBe(200);
      if (started.status !== 200) return;
      const attemptId = started.data.attempts[0].id;

      // 2. Paystack settles the test charge within seconds; verification is
      // what the app and the webhook both run.
      let result = await finalizePayment(attemptId, deps);
      for (let i = 0; i < 20 && result.status === "pending"; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        result = await finalizePayment(attemptId, deps);
      }
      expect(result.status, JSON.stringify(result)).toBe("succeeded");

      const { data: attempt } = await service
        .from("payment_attempt")
        .select("status, transaction_id, provider_reference")
        .eq("id", attemptId)
        .single();
      expect(attempt?.status).toBe("succeeded");
      const transactionId = attempt?.transaction_id as string;
      const { data: txn } = await service
        .from("transaction")
        .select(
          "status, amount, currency, provider, provider_transaction_id, country_code",
        )
        .eq("id", transactionId)
        .single();
      expect(txn).toMatchObject({
        status: "successful",
        amount: 52.5, // GH₵50 ticket + 5% service fee
        currency: "GHS",
        provider: "paystack",
        country_code: "GH",
      });
      expect(txn?.provider_transaction_id).toBeTruthy();

      // 3. Ticket issued; fee and organizer earning booked once each.
      const { data: checkoutRows } = await service
        .from("ticket_checkout")
        .select("id, status")
        .eq("checkout_session_id", sessionId);
      expect(checkoutRows?.map((r) => r.status)).toEqual(["paid"]);
      const { count: tickets } = await service
        .from("ticket")
        .select("id", { count: "exact", head: true })
        .eq("transaction_id", transactionId);
      expect(tickets).toBe(1);
      const { data: fees } = await service
        .from("platform_fee_entry")
        .select(
          "entry_type, ticket_revenue, service_fee, total_customer_payment, currency",
        )
        .eq("transaction_id", transactionId);
      expect(fees).toEqual([
        expect.objectContaining({
          entry_type: "fee",
          ticket_revenue: 50,
          service_fee: 2.5,
          total_customer_payment: 52.5,
          currency: "GHS",
        }),
      ]);
      const ledger = async () =>
        (
          await service
            .from("organizer_ledger_entry")
            .select("entry_type, amount, currency")
            .eq("transaction_id", transactionId)
            .order("created_at")
        ).data ?? [];
      expect(await ledger()).toEqual([
        { entry_type: "earning", amount: 50, currency: "GHS" },
      ]);

      // 4. Refund: a real Paystack /refund call for the ticket price only.
      const refund = await issueRefundCore(service, transactionId);
      expect(refund.status, refund.message).toBe(200);
      const { data: pending } = await service
        .from("transaction")
        .select("status")
        .eq("id", transactionId)
        .single();
      expect(pending?.status).toBe("refund_pending");
      expect(await ledger()).toEqual([
        { entry_type: "earning", amount: 50, currency: "GHS" },
        { entry_type: "refund_hold", amount: -50, currency: "GHS" },
      ]);

      // 5. Paystack's refund.processed webhook, signed as Paystack signs it.
      const body = JSON.stringify({
        event: "refund.processed",
        data: {
          status: "processed",
          transaction_reference: attempt?.provider_reference,
          amount: 5000,
          currency: "GHS",
        },
      });
      const delivered = await handleProviderWebhook({
        providerCode: "paystack",
        countryCode: "GH",
        rawBody: body,
        headers: new Headers({
          "x-paystack-signature": createHmac("sha512", SANDBOX_KEY)
            .update(body)
            .digest("hex"),
        }),
        deps,
      });
      expect(delivered.status).toBe(200);

      // 6. Final state: refunded (the ticket price; the fee is kept), the
      // organizer's earning fully offset, the fee mirror recorded, and a
      // second request answered without refunding twice.
      const { data: done } = await service
        .from("transaction")
        .select("status")
        .eq("id", transactionId)
        .single();
      expect(done?.status).toBe("refunded");
      const { data: refundable } = await service.rpc(
        "get_transaction_refundable_amount",
        { p_transaction_id: transactionId },
      );
      expect(Number(refundable)).toBe(50);
      const again = await issueRefundCore(service, transactionId);
      // Idempotent: answered from the record, no second provider refund.
      expect(again.message).toMatch(/already refunded/i);
      const { data: feeRows } = await service
        .from("platform_fee_entry")
        .select("entry_type")
        .eq("transaction_id", transactionId);
      expect((feeRows ?? []).map((r) => r.entry_type).sort()).toEqual([
        "fee",
        "fee_refund_adjustment",
      ]);
      const net = (await ledger()).reduce(
        (sum, r) => sum + Number(r.amount),
        0,
      );
      expect(net).toBe(0);

      await service
        .from("payment_method")
        .delete()
        .eq("id", wallet?.id as string);
    }, 120_000);
  },
);
