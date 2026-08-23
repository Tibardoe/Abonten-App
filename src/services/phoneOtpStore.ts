// Server-only, in-memory pending-OTP store. Holds the Hubtel requestId/
// prefix returned by a successful send, keyed by phone number + purpose, so
// the client never receives them (it only ever sends {phone, code} to
// verify) and so a resend/replay can't reuse an already-consumed code.
//
// Same tradeoff already accepted by the pre-existing
// sendOtpForPhoneUpdate.ts cooldown Map: per-server-instance memory, not
// durable across restarts or multiple instances. Fine at this app's current
// scale; a multi-instance deployment would need this backed by a table or
// Redis instead.

export type PhoneOtpPurpose = "sign-in" | "phone-update";

type PendingOtp = {
  requestId: string;
  prefix: string;
  createdAt: number;
  attempts: number;
};

const PENDING_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_VERIFY_ATTEMPTS = 5;

const pendingByKey = new Map<string, PendingOtp>();
const lastSentAtByKey = new Map<string, number>();

function makeKey(purpose: PhoneOtpPurpose, phoneE164: string): string {
  return `${purpose}:${phoneE164}`;
}

export function getResendCooldownRemainingMs(
  purpose: PhoneOtpPurpose,
  phoneE164: string,
): number {
  const lastSentAt = lastSentAtByKey.get(makeKey(purpose, phoneE164));
  if (!lastSentAt) return 0;

  const remaining = RESEND_COOLDOWN_MS - (Date.now() - lastSentAt);
  return remaining > 0 ? remaining : 0;
}

export function recordOtpSent(
  purpose: PhoneOtpPurpose,
  phoneE164: string,
  requestId: string,
  prefix: string,
): void {
  const key = makeKey(purpose, phoneE164);
  lastSentAtByKey.set(key, Date.now());
  pendingByKey.set(key, {
    requestId,
    prefix,
    createdAt: Date.now(),
    attempts: 0,
  });
}

export function getPendingOtp(
  purpose: PhoneOtpPurpose,
  phoneE164: string,
): PendingOtp | null {
  const key = makeKey(purpose, phoneE164);
  const entry = pendingByKey.get(key);
  if (!entry) return null;

  if (Date.now() - entry.createdAt > PENDING_TTL_MS) {
    pendingByKey.delete(key);
    return null;
  }

  return entry;
}

// Called before attempting a Hubtel verify. Returns false once the attempt
// budget is exhausted, in which case the pending entry is cleared and the
// caller must request a fresh code.
export function registerVerifyAttempt(
  purpose: PhoneOtpPurpose,
  phoneE164: string,
): boolean {
  const key = makeKey(purpose, phoneE164);
  const entry = pendingByKey.get(key);
  if (!entry) return false;

  entry.attempts += 1;

  if (entry.attempts > MAX_VERIFY_ATTEMPTS) {
    pendingByKey.delete(key);
    return false;
  }

  return true;
}

// Called once a code has been successfully verified, so it can never be
// replayed and a resend always starts a fresh attempt budget.
export function clearPendingOtp(
  purpose: PhoneOtpPurpose,
  phoneE164: string,
): void {
  pendingByKey.delete(makeKey(purpose, phoneE164));
}
