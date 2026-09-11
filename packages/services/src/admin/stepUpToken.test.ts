import { describe, expect, it } from "vitest";
import { deriveSigningKey } from "../security/signing";
import { createStepUpToken, readStepUpToken } from "./stepUpToken";

const key = deriveSigningKey("admin-stepup:v1", "test-secret");
const otherKey = deriveSigningKey("admin-stepup:v1", "another-secret");
const admin = "8b1c7d2e-0000-4000-8000-000000000001";
const other = "8b1c7d2e-0000-4000-8000-000000000002";

describe("step-up token", () => {
  it("round-trips for the admin it was issued to", () => {
    const token = createStepUpToken(admin, 1_757_000_000_000, key);
    expect(readStepUpToken(token, admin, key)).toBe(1_757_000_000_000);
  });

  it("rejects a bare timestamp (the old, forgeable format)", () => {
    expect(readStepUpToken(String(Date.now()), admin, key)).toBeNull();
  });

  it("rejects a token issued to someone else", () => {
    const token = createStepUpToken(other, 1_757_000_000_000, key);
    expect(readStepUpToken(token, admin, key)).toBeNull();
  });

  it("rejects a token whose timestamp was changed", () => {
    const token = createStepUpToken(admin, 1_757_000_000_000, key);
    const [, signature] = token.split(".");
    expect(
      readStepUpToken(`${Date.now()}.${signature}`, admin, key),
    ).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = createStepUpToken(admin, 1_757_000_000_000, otherKey);
    expect(readStepUpToken(token, admin, key)).toBeNull();
  });

  it("rejects missing and malformed values", () => {
    expect(readStepUpToken(undefined, admin, key)).toBeNull();
    expect(readStepUpToken("", admin, key)).toBeNull();
    expect(readStepUpToken(".abc", admin, key)).toBeNull();
    expect(readStepUpToken("12x.abc", admin, key)).toBeNull();
    expect(readStepUpToken("123.", admin, key)).toBeNull();
  });

  it("keeps keys for different purposes apart", () => {
    const referralKey = deriveSigningKey("referral-cookie:v1", "test-secret");
    expect(referralKey.equals(key)).toBe(false);
  });
});
