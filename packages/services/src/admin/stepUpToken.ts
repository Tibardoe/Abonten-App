import {
  deriveSigningKey,
  hmacBase64Url,
  signaturesMatch,
} from "../security/signing";

// The admin console's "confirm your identity" stamp. Sensitive actions (ban,
// finance, settings) need a fresh OAuth round trip within the last 10
// minutes; the callback records that moment in an httpOnly cookie.
//
// The cookie used to hold a bare timestamp, so anyone holding an admin's
// session cookies could write their own fresh timestamp and skip the check.
// It is now `<ms>.<HMAC(user id, ms)>`: only the server can mint one, and a
// stamp is only valid for the admin it was issued to (signing in as someone
// else to get a stamp, then swapping the stolen session back in, fails).

const PURPOSE = "admin-stepup:v1";

export function createStepUpToken(
  userId: string,
  at: number,
  key: Buffer = deriveSigningKey(PURPOSE),
): string {
  return `${at}.${hmacBase64Url(key, `${userId}:${at}`)}`;
}

/**
 * The re-authentication time in a step-up cookie, or null when the cookie is
 * missing, malformed, forged, or was issued to a different user.
 */
export function readStepUpToken(
  token: string | null | undefined,
  userId: string,
  key?: Buffer,
): number | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;

  const atRaw = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!/^\d{1,16}$/.test(atRaw) || signature.length === 0) return null;

  const at = Number(atRaw);
  const expected = hmacBase64Url(
    key ?? deriveSigningKey(PURPOSE),
    `${userId}:${at}`,
  );
  return signaturesMatch(signature, expected) ? at : null;
}
