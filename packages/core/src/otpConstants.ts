// Hubtel's OTP product issues 4-digit codes. Shared by the client-side OTP
// box UI (src/components/molecules/OtpInput.tsx and its callers) and the
// server-side verify actions, so the two never drift out of sync. Plain
// constants (no server-only code) so it's safe to import from "use client"
// files.
export const HUBTEL_OTP_CODE_LENGTH = 4;
