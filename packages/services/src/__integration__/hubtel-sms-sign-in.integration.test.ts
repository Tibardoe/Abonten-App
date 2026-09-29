import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Ghana sign-in end to end with Abonten-made codes: the real send path runs
// with Hubtel's SMS API stubbed, the code is read from the stubbed text
// message, and it must sign the person in exactly once. The database never
// holds the code itself, a pending code expires, and one left over from
// Hubtel's old OTP product is refused rather than checked.
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
import { verifyPhoneOtpAndResolveUser } from "../profile/phoneAuthCore";
import { sendPhoneOtpCore } from "../profile/phoneOtpSendCore";
import { recordOtpSent } from "../profile/phoneOtpStore";
import { getServiceClient } from "./setupClient";

// A Ghana number no real person has (the 0 after the network code).
const NUMBER = "0201234570";
const E164 = "+233201234570";
const ENV = [
  "HUBTEL_API_CLIENT_ID",
  "HUBTEL_API_CLIENT_SECRET",
  "HUBTEL_SMS_SENDER_ID",
];

describe("Ghana sign-in through Hubtel's SMS API", () => {
  let service: SupabaseClient<Database>;
  const saved: Record<string, string | undefined> = {};
  const createdUsers: string[] = [];
  let texts: Array<{ To: string; From: string; Content: string }> = [];

  async function clean() {
    await service.from("phone_otp_send_log").delete().eq("phone_e164", E164);
    await service.from("phone_otp_state").delete().eq("phone_e164", E164);
  }

  async function requestCode(): Promise<string> {
    const sent = await sendPhoneOtpCore({
      dialCode: "+233",
      rawPhone: NUMBER,
      purpose: "sign-in",
      ipAddress: "198.51.100.88",
    });
    expect(sent).toMatchObject({
      status: 200,
      phoneE164: E164,
      codeLength: 6,
      provider: "hubtel",
    });
    const content = texts.at(-1)?.Content ?? "";
    const code = content.match(/\b(\d{6})\b/)?.[1];
    if (!code) throw new Error("no code in the text message");
    return code;
  }

  beforeAll(async () => {
    service = getServiceClient();
    for (const name of ENV) saved[name] = process.env[name];
    process.env.HUBTEL_API_CLIENT_ID = "test-hubtel-id";
    process.env.HUBTEL_API_CLIENT_SECRET = "test-hubtel-secret";
    process.env.HUBTEL_SMS_SENDER_ID = "Abontenhub";
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
    await clean();
  });

  afterEach(async () => {
    texts = [];
    await clean();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    for (const id of createdUsers) await service.auth.admin.deleteUser(id);
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    invalidateMarketCache();
  });

  it("signs in with the texted code once, and the table never holds it", async () => {
    const code = await requestCode();
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatchObject({ To: "233201234570", From: "Abontenhub" });

    const { data: pending } = await service
      .from("phone_otp_state")
      .select("provider, request_id, prefix")
      .eq("purpose", "sign-in")
      .eq("phone_e164", E164)
      .single();
    expect(pending?.provider).toBe("hubtel");
    expect(JSON.stringify(pending)).not.toContain(code);

    const wrong = await verifyPhoneOtpAndResolveUser(
      E164,
      code === "000000" ? "000001" : "000000",
    );
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.status).toBe(401);

    const right = await verifyPhoneOtpAndResolveUser(E164, code);
    expect(right.ok).toBe(true);
    if (right.ok) {
      createdUsers.push(right.userId);
      expect(right.isNewUser).toBe(true);
    }

    const replay = await verifyPhoneOtpAndResolveUser(E164, code);
    expect(replay.ok).toBe(false);
  });

  it("refuses the code once it has expired", async () => {
    const code = await requestCode();
    await service
      .from("phone_otp_state")
      .update({ created_at: new Date(Date.now() - 6 * 60_000).toISOString() })
      .eq("purpose", "sign-in")
      .eq("phone_e164", E164);
    const late = await verifyPhoneOtpAndResolveUser(E164, code);
    expect(late.ok).toBe(false);
  });

  it("refuses a code still pending from Hubtel's old OTP product", async () => {
    await recordOtpSent("sign-in", E164, "old-request-id", "ABCD", "hubtel");
    const result = await verifyPhoneOtpAndResolveUser(E164, "123456");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("expired");
  });
});
