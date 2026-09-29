import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hubtelOtpProvider, otpMessage } from "./hubtelOtpProvider";

const PHONE = "+233201234569";
const ENV = [
  "HUBTEL_API_CLIENT_ID",
  "HUBTEL_API_CLIENT_SECRET",
  "HUBTEL_SMS_SENDER_ID",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

// Assigning undefined would store the string "undefined" in process.env.
function unsetEnv(name: string) {
  delete process.env[name];
}

type Sent = { url: string; auth: string; body: Record<string, string> };

/** Stubs Hubtel's SMS API with `reply` and records what was posted. */
function stubHubtel(reply: () => Response): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({
        url: String(input),
        auth: new Headers(init?.headers).get("Authorization") ?? "",
        body: JSON.parse(String(init?.body)),
      });
      return reply();
    },
  );
  return sent;
}

function hubtelReply(status: number, body: Record<string, unknown>) {
  return () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
}

const ACCEPTED = hubtelReply(201, {
  rate: 0.0243,
  messageId: "d1394ad0-7d4e-4551-965c-83126b175923",
  status: 0,
  networkId: "62001",
  clientReference: "x",
  statusDescription: "request submitted successfully",
});

function codeIn(content: string): string {
  const match = content.match(/\b(\d{6})\b/);
  if (!match) throw new Error(`no six-digit code in "${content}"`);
  return match[1];
}

describe("hubtelOtpProvider", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of ENV) saved[name] = process.env[name];
    process.env.HUBTEL_API_CLIENT_ID = "client-id";
    process.env.HUBTEL_API_CLIENT_SECRET = "client-secret";
    process.env.HUBTEL_SMS_SENDER_ID = "Abontenhub";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const name of ENV) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it("texts a six-digit code through the SMS API and keeps only its HMAC", async () => {
    const sent = stubHubtel(ACCEPTED);
    const result = await hubtelOtpProvider.send(PHONE, "GH");

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://sms.hubtel.com/v1/messages/send");
    expect(sent[0].auth).toBe(
      `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`,
    );
    expect(sent[0].body.From).toBe("Abontenhub");
    expect(sent[0].body.To).toBe("233201234569");
    const code = codeIn(sent[0].body.Content);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(sent[0].body.ClientReference).toBe(result.requestId);
    expect(result.prefix.startsWith("h1.")).toBe(true);
    expect(result.prefix).not.toContain(code);
    expect(hubtelOtpProvider.codeLength()).toBe(6);

    expect(
      await hubtelOtpProvider.verify(result.requestId, result.prefix, code),
    ).toEqual({ ok: true });
  });

  it("refuses a wrong code, and the right code under another send", async () => {
    const sent = stubHubtel(ACCEPTED);
    const first = await hubtelOtpProvider.send(PHONE, "GH");
    const second = await hubtelOtpProvider.send(PHONE, "GH");
    if (!first.ok || !second.ok) throw new Error("send failed");
    const firstCode = codeIn(sent[0].body.Content);
    const wrong = firstCode === "000000" ? "000001" : "000000";

    expect(
      await hubtelOtpProvider.verify(first.requestId, first.prefix, wrong),
    ).toEqual({ ok: false, message: "That code is incorrect." });
    const secondCode = codeIn(sent[1].body.Content);
    if (secondCode !== firstCode) {
      expect(
        await hubtelOtpProvider.verify(
          second.requestId,
          second.prefix,
          firstCode,
        ),
      ).toMatchObject({ ok: false });
    }
  });

  it("treats a code still pending from the old OTP product as expired", async () => {
    expect(await hubtelOtpProvider.verify("req-1", "ABCD", "1234")).toEqual({
      ok: false,
      message: "That code has expired. Request a new one.",
    });
  });

  it("reports an unfunded account with Hubtel's status in the detail", async () => {
    stubHubtel(
      hubtelReply(400, {
        rate: 0,
        messageId: null,
        status: 12,
        statusDescription: "Payment required on account",
      }),
    );
    const result = await hubtelOtpProvider.send(PHONE, "GH");
    expect(result).toMatchObject({
      ok: false,
      reason: "provider_error",
      message: "Couldn't send the verification code. Please try again.",
    });
    if (!result.ok) {
      expect(result.detail).toBe(
        "Hubtel SMS send refused (HTTP 400, status 12): Payment required on account",
      );
    }
  });

  it.each([
    { status: 7, statusDescription: "Rejected" },
    { status: null },
    { status: "" },
    {},
  ])(
    "does not count an HTTP success without an accepting status as sent (%j)",
    async (reply) => {
      stubHubtel(hubtelReply(200, reply));
      const result = await hubtelOtpProvider.send(PHONE, "GH");
      expect(result).toMatchObject({ ok: false, reason: "provider_error" });
    },
  );

  it("reports a request that never completed", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("socket hang up");
    });
    const result = await hubtelOtpProvider.send(PHONE, "GH");
    expect(result).toMatchObject({ ok: false, reason: "provider_error" });
    if (!result.ok) expect(result.detail).toContain("did not complete");
  });

  it("is unconfigured without a sender ID or with one Hubtel would refuse", async () => {
    unsetEnv("HUBTEL_SMS_SENDER_ID");
    expect(hubtelOtpProvider.isConfigured()).toBe(false);
    const sent = stubHubtel(ACCEPTED);
    expect(await hubtelOtpProvider.send(PHONE, "GH")).toMatchObject({
      ok: false,
      reason: "not_configured",
    });
    expect(sent).toHaveLength(0);

    process.env.HUBTEL_SMS_SENDER_ID = "AbontenHubGhana";
    expect(hubtelOtpProvider.isConfigured()).toBe(false);
    expect(hubtelOtpProvider.requiredEnv()).toContain("HUBTEL_SMS_SENDER_ID");
  });

  it("keeps the message to one plain-ASCII text", () => {
    const message = otpMessage("012345");
    expect(message).toContain("012345");
    expect(message).toContain("5 minutes");
    expect(message.length).toBeLessThanOrEqual(160);
    expect(/^[\x20-\x7E]+$/.test(message)).toBe(true);
  });
});
