import { createHmac } from "node:crypto";
import { normalizeIdNumber } from "@abonten/core/identity/rules";
import { foldSearchText } from "@abonten/core/search/foldSearchText";

// Keyed hashes that let Abonten see the same person on two accounts without
// keeping their document number: one of the document (country, type,
// number), one of the person (legal name and date of birth, for someone who
// shows a different document). The key is IDENTITY_HASH_SECRET, a dedicated
// secret: if it changed, nothing could be re-hashed (the numbers are not
// kept), so matches across the change would be missed. Never rotate it
// without accepting that.

export const IDENTITY_HASH_ENV = "IDENTITY_HASH_SECRET";

function secret(): string | null {
  const value = process.env[IDENTITY_HASH_ENV]?.trim();
  return value && value.length >= 32 ? value : null;
}

export function isIdentityHashReady(): boolean {
  return secret() !== null;
}

function hmac(purpose: string, value: string): string | null {
  const key = secret();
  if (!key) return null;
  return createHmac("sha256", key)
    .update(`abonten:${purpose}:`)
    .update(value)
    .digest("hex");
}

export function documentHash(
  country: string,
  documentType: string,
  idNumber: string | null,
): string | null {
  const number = idNumber ? normalizeIdNumber(idNumber) : "";
  if (number.length < 4) return null;
  return hmac(
    "identity-document:v1",
    `${country.toUpperCase()}|${documentType.toUpperCase()}|${number}`,
  );
}

export function personHash(
  legalName: string | null,
  dateOfBirth: string | null,
): string | null {
  if (!legalName || !dateOfBirth) return null;
  const words = foldSearchText(legalName)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .sort();
  if (words.length < 2) return null;
  return hmac("identity-person:v1", `${words.join(" ")}|${dateOfBirth}`);
}
