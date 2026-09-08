// Shared, framework-free helpers for email one-time-code sign-in. Safe to
// import from a "use client" file, a Server Action, an /api/mobile route, or
// the native app — no server-only code, no DOM.
//
// Email OTP differs from the phone (Hubtel) OTP in two ways that matter here:
//   1. Supabase issues 6-digit codes for email (auth.email.otp_length), not
//      Hubtel's 4 — so this has its own length constant. Do NOT reuse
//      HUBTEL_OTP_CODE_LENGTH for email.
//   2. Supabase owns the entire token lifecycle (generation, hashing,
//      expiry, single-use, per-IP verification cap). The app never sees or
//      stores an email code, so there is no phone_otp_state equivalent.

export const EMAIL_OTP_CODE_LENGTH = 6;

// Deliberately permissive. This is a pre-send sanity check to avoid firing a
// request for something that obviously isn't an address — it is NOT an
// authority on deliverability, and it must never be used to tell a caller
// whether an account exists. Mirrors the check already inlined in
// apps/mobile settings/security.tsx.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isLikelyEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length <= 254 && EMAIL_RE.test(trimmed);
}

/** Lowercase + trim, the form we send to Supabase and key rate limits on. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Masks the local part for display on the "check your email" screen:
 * "ben@example.com" -> "b••@example.com", "jo@x.io" -> "j•@x.io". The
 * domain is kept so the user can spot a typo; the local part is reduced to
 * its first character so a shoulder-surfer can't read the whole address.
 */
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return trimmed;

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const firstChar = local.slice(0, 1);
  const masked = "•".repeat(Math.max(local.length - 1, 1));

  return `${firstChar}${masked}@${domain}`;
}

// User-facing copy. Every message is intentionally generic about whether an
// account exists (account-enumeration guard — see the task's FLOW 8/9 and
// §14). Shared so web and mobile never drift.
export const EMAIL_OTP_MESSAGES = {
  invalidEmail: "Enter a valid email address.",
  // Shown after a successful send request regardless of whether the address
  // is registered.
  codeSent: "If that email can receive mail, we've sent a 6-digit code.",
  invalidFormat: "Enter the 6-digit code we emailed you.",
  incorrect: "That code isn't correct.",
  expired: "That code has expired. Request a new one.",
  rateLimited: "Too many requests. Please wait a moment and try again.",
  generic: "Something went wrong. Please try again.",
} as const;
