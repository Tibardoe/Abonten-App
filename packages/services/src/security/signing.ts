import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC key for a value the server hands out in a cookie and later reads back
 * (the admin step-up stamp, the referral-link cookie). Derived from the
 * service-role key, which is already a server-only secret in every app that
 * signs one of these, so no new environment variable has to be provisioned;
 * rotating that key just invalidates the cookies (admins confirm their
 * identity again, a referral link has to be opened again). `purpose` keeps
 * the keys for different cookies apart, so one can never be replayed as
 * another.
 */
export function deriveSigningKey(
  purpose: string,
  secret: string | undefined = process.env.SUPABASE_SERVICE_ROLE_KEY,
): Buffer {
  if (!secret) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createHash("sha256")
    .update(`abonten:${purpose}:`)
    .update(secret)
    .digest();
}

export function hmacBase64Url(key: Buffer, message: string): string {
  return createHmac("sha256", key).update(message).digest("base64url");
}

/** Constant-time comparison of two signatures. */
export function signaturesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
