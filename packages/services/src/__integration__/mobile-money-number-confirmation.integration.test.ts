import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// A mobile money number is confirmed before it is saved (migration
// mobile_money_number_confirmation): a code texted to it, under its own
// "wallet" purpose, unless it is the account's own verified phone. Runs the
// real send path with Hubtel's SMS API stubbed, as hubtel-sms-sign-in does,
// and reads the code from the stubbed text message.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { invalidateMarketCache } from "../markets/marketConfig";
import { addPayoutAccountCore } from "../organizer/payoutAccountCore";
import { requestMobileMoneyNumberCodeCore } from "../payments/mobileMoneyNumberCheck";
import { addPaymentMethodCore } from "../payments/paymentMethodCore";
import { sendPhoneOtpCore } from "../profile/phoneOtpSendCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Ghana numbers no real person has (the 0 after the network code).
const NUMBER = "0201234571";
const E164 = "+233201234571";
const OWN = "+233201234572";
const ENV = [
  "HUBTEL_API_CLIENT_ID",
  "HUBTEL_API_CLIENT_SECRET",
  "HUBTEL_SMS_SENDER_ID",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

describe("mobile money numbers are confirmed before they are saved", () => {
  let service: SupabaseClient<Database>;
  let user: TestUser;
  const saved: Record<string, string | undefined> = {};
  let texts: Array<{ To: string; Content: string }> = [];

  async function clean() {
    for (const phone of [E164, OWN]) {
      await service.from("phone_otp_send_log").delete().eq("phone_e164", phone);
      await service.from("phone_otp_state").delete().eq("phone_e164", phone);
    }
  }

  function lastCode(): string {
    const code = texts.at(-1)?.Content.match(/\b(\d{6})\b/)?.[1];
    if (!code) throw new Error("no code in the text message");
    return code;
  }

  async function requestWalletCode(): Promise<string> {
    const res = await requestMobileMoneyNumberCodeCore(
      user.client,
      user.id,
      { phone: NUMBER, use: "wallet" },
      "198.51.100.89",
    );
    expect(res).toEqual({
      status: 200,
      data: { phoneE164: E164, needsCode: true, codeLength: 6 },
    });
    return lastCode();
  }

  const momo = (code?: string, networkCode = "MTN") => ({
    type: "momo" as const,
    networkCode,
    networkName: networkCode,
    phone: NUMBER,
    ...(code ? { code } : {}),
  });

  beforeAll(async () => {
    service = getServiceClient();
    for (const name of ENV) saved[name] = process.env[name];
    process.env.HUBTEL_API_CLIENT_ID = "test-hubtel-id";
    process.env.HUBTEL_API_CLIENT_SECRET = "test-hubtel-secret";
    process.env.HUBTEL_SMS_SENDER_ID = "Abontenhub";
    // The cores reach the database through their own service-role client.
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
    invalidateMarketCache();
    const real = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (url === "https://sms.hubtel.com/v1/messages/send") {
          texts.push(JSON.parse(String(init?.body)));
          return new Response(
            JSON.stringify({
              rate: 0.0243,
              messageId: crypto.randomUUID(),
              status: 0,
              networkId: "62001",
              statusDescription: "request submitted successfully",
            }),
            { status: 201, headers: { "content-type": "application/json" } },
          );
        }
        return real(input, init);
      },
    );
    user = await createTestUser(service);
    await clean();
  });

  afterEach(async () => {
    texts = [];
    await clean();
    await service.from("payment_method").delete().eq("user_id", user.id);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await service.from("payout_account").delete().eq("organizer_id", user.id);
    await deleteTestUser(service, user.id);
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    invalidateMarketCache();
  });

  it("saves a wallet with the code texted to it, once", async () => {
    const code = await requestWalletCode();
    const { data: pending } = await service
      .from("phone_otp_state")
      .select("purpose")
      .eq("phone_e164", E164);
    expect(pending).toEqual([{ purpose: "wallet" }]);

    const wrong = code === "000000" ? "111111" : "000000";
    const refused = await addPaymentMethodCore(
      user.client,
      user.id,
      momo(wrong),
    );
    expect(refused.status).toBe(400);

    const added = await addPaymentMethodCore(user.client, user.id, momo(code));
    expect(added.status).toBe(200);
    const details =
      added.status === 200
        ? (added.data.details as Record<string, unknown>)
        : {};
    expect(details.phone).toBe(E164);
    expect(details.code).toBeUndefined();
    expect(typeof details.verifiedAt).toBe("string");

    // Used up: the same code cannot confirm the number again.
    const again = await addPaymentMethodCore(
      user.client,
      user.id,
      momo(code, "VOD"),
    );
    expect(again.status).toBe(400);
  });

  it("refuses a wallet sent without a code", async () => {
    const res = await addPaymentMethodCore(user.client, user.id, momo());
    expect(res.status).toBe(400);
    const { count } = await service
      .from("payment_method")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    expect(count).toBe(0);
  });

  it("never takes a sign-in code as a wallet code", async () => {
    const sent = await sendPhoneOtpCore({
      dialCode: "+233",
      rawPhone: NUMBER,
      purpose: "sign-in",
      ipAddress: "198.51.100.89",
    });
    expect(sent.status).toBe(200);
    const res = await addPaymentMethodCore(
      user.client,
      user.id,
      momo(lastCode()),
    );
    expect(res.status).toBe(400);
  });

  it("texts nothing for the account's own verified phone", async () => {
    const { error } = await service.auth.admin.updateUserById(user.id, {
      phone: OWN.slice(1),
      phone_confirm: true,
    });
    expect(error).toBeNull();

    const res = await requestMobileMoneyNumberCodeCore(
      user.client,
      user.id,
      { phone: OWN, use: "wallet" },
      null,
    );
    expect(res).toEqual({
      status: 200,
      data: { phoneE164: OWN, needsCode: false, codeLength: 0 },
    });
    expect(texts).toHaveLength(0);

    const added = await addPaymentMethodCore(user.client, user.id, {
      type: "momo",
      networkCode: "MTN",
      networkName: "MTN",
      phone: OWN,
    });
    expect(added.status).toBe(200);
  });

  it("confirms a payout account's number the same way", async () => {
    const res = await requestMobileMoneyNumberCodeCore(
      user.client,
      user.id,
      { phone: NUMBER, use: "payout" },
      null,
    );
    expect(res.status).toBe(200);
    const payout = {
      accountType: "mobile_money" as const,
      accountHolderName: "Ama Mensah",
      networkCode: "MTN",
      networkName: "MTN",
      phone: NUMBER,
    };
    const refused = await addPayoutAccountCore(user.client, user.id, payout);
    expect(refused.status).toBe(400);
    const added = await addPayoutAccountCore(user.client, user.id, {
      ...payout,
      code: lastCode(),
    });
    expect(added.status).toBe(200);
  });
});
