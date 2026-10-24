import { PRODUCTION_SUPABASE_REF } from "@abonten/core/env/productionProject";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { documentHash, personHash } from "../identityHash";
import { testIdentityProviderAllowed } from "./registry";
import {
  SMILE_CALLBACK_MAX_AGE_MS,
  parseSmileResult,
  smileCallbackSignature,
  smileIdProvider,
} from "./smileId";

const PARTNER = "1234";
const KEY = "not-a-real-key-for-tests";
const saved = { ...process.env };

beforeEach(() => {
  process.env.SMILE_ID_PARTNER_ID = PARTNER;
  process.env.SMILE_ID_API_KEY = KEY;
  process.env.IDENTITY_HASH_SECRET = "x".repeat(40);
});

afterEach(() => {
  process.env = { ...saved };
});

function signed(timestamp: string, signature?: string): Headers {
  return new Headers({
    "response-timestamp": timestamp,
    "response-signature":
      signature ?? smileCallbackSignature(timestamp, PARTNER, KEY),
    "smileid-job-id": "job_123",
    "user-id": "abn_0001",
  });
}

describe("Smile ID webhook", () => {
  const now = Date.parse("2026-10-23T12:00:00Z");
  const ts = "2026-10-23T11:59:00.000Z";

  it("accepts a signed, fresh callback and reads the verdict", () => {
    const body = JSON.stringify({
      status: "clear",
      reason: "Clear",
      partner_params: { abonten_verification_id: "v-1" },
      id_fields: {
        full_name: "Ama Korkor Mensah",
        date_of_birth: "1994-05-02",
        id_number: "GHA-123456789-0",
        expiration_date: "2031-01-31",
      },
      antifraud: {
        fraud_risk: { risk_level: "LOW" },
        summary: { fraud_detected: false },
        smile_secure: { suspect_users: [] },
      },
    });
    const res = smileIdProvider.verifyCallback(signed(ts), body, now);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result).toMatchObject({
      providerJobId: "job_123",
      providerUserRef: "abn_0001",
      verificationId: "v-1",
      status: "clear",
      reason: "clear",
      riskLevel: "low",
      fraudDetected: false,
      providerDuplicate: false,
      fullName: "Ama Korkor Mensah",
      dateOfBirth: "1994-05-02",
      documentExpiresOn: "2031-01-31",
    });
  });

  it("refuses a wrong signature, a missing one and an old timestamp", () => {
    expect(
      smileIdProvider.verifyCallback(signed(ts, "AAAA"), "{}", now),
    ).toMatchObject({ ok: false, reason: "signature" });
    expect(
      smileIdProvider.verifyCallback(new Headers(), "{}", now),
    ).toMatchObject({ ok: false, reason: "signature" });
    const old = new Date(now - SMILE_CALLBACK_MAX_AGE_MS - 1000).toISOString();
    expect(
      smileIdProvider.verifyCallback(signed(old), "{}", now),
    ).toMatchObject({ ok: false, reason: "stale" });
  });

  it("refuses a signature made with another key", () => {
    const forged = smileCallbackSignature(ts, PARTNER, "someone-else");
    expect(
      smileIdProvider.verifyCallback(signed(ts, forged), "{}", now),
    ).toMatchObject({ ok: false, reason: "signature" });
  });

  it("refuses everything when Smile ID is not configured", () => {
    Reflect.deleteProperty(process.env, "SMILE_ID_API_KEY");
    expect(smileIdProvider.isConfigured()).toBe(false);
    expect(smileIdProvider.verifyCallback(signed(ts), "{}", now)).toMatchObject(
      { ok: false },
    );
  });

  it("treats an unknown status as still processing, and builds a split name", () => {
    const r = parseSmileResult({
      status: "pending",
      id_fields: { first_name: "Kofi", last_name: "Boateng" },
      antifraud: { smile_secure: { suspect_users: [{ user_id: "x" }] } },
    });
    expect(r.status).toBe("processing");
    expect(r.fullName).toBe("Kofi Boateng");
    expect(r.providerDuplicate).toBe(true);
    expect(r.fraudDetected).toBe(null);
  });
});

describe("identity hashes", () => {
  it("match the same document however its number is written", () => {
    expect(documentHash("gh", "ghana_card", "GHA-123456789-0")).toBe(
      documentHash("GH", "GHANA_CARD", "gha 1234567890"),
    );
    expect(documentHash("GH", "PASSPORT", "GHA-123456789-0")).not.toBe(
      documentHash("GH", "GHANA_CARD", "GHA-123456789-0"),
    );
    expect(documentHash("GH", "PASSPORT", "12")).toBe(null);
  });

  it("match the same person in any word order and case", () => {
    expect(personHash("MENSAH Ama Korkor", "1994-05-02")).toBe(
      personHash("Ama Korkor Mensah", "1994-05-02"),
    );
    expect(personHash("Ama Mensah", "1994-05-03")).not.toBe(
      personHash("Ama Mensah", "1994-05-02"),
    );
    expect(personHash("Ama", "1994-05-02")).toBe(null);
  });

  it("are not made without a long enough secret", () => {
    process.env.IDENTITY_HASH_SECRET = "short";
    expect(documentHash("GH", "PASSPORT", "G1234567")).toBe(null);
  });
});

describe("the test provider", () => {
  it("is refused on the production deployment and database", () => {
    expect(
      testIdentityProviderAllowed({
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_SUPABASE_URL: "https://qasxtirvfbreygsqwwat.supabase.co",
      }),
    ).toBe(true);
    expect(testIdentityProviderAllowed({ VERCEL_ENV: "production" })).toBe(
      false,
    );
    expect(
      testIdentityProviderAllowed({
        VERCEL_ENV: "preview",
        SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co`,
      }),
    ).toBe(false);
  });
});
