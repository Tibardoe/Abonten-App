// The number of digits in a text-message code comes from the provider the
// market uses (six for every provider since 2026-09-29, when Hubtel codes
// moved from Hubtel's four-digit OTP product to Abonten-made codes). The
// send response carries the real `codeLength`; this is the fallback a code
// box shows before a code has been requested, and the length Field Ops
// screens use. Plain constants (no server-only code) so it's safe to import
// from "use client" files.
export const DEFAULT_PHONE_OTP_CODE_LENGTH = 6;
