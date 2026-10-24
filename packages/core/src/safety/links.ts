// Links Abonten Safety builds: the phone's own Messages app (the path that
// works with no internet), a map pin, directions, and the pages contacts
// open. Pure strings, shared by the app, the website and the services.

export type SmsPlatform = "ios" | "android" | "web";

/**
 * Opens the phone's Messages app addressed to `phones` with `body` written.
 * iOS takes `sms:/open?addresses=a,b&body=…`; Android and the web take
 * `sms:a;b?body=…` (both are what each platform's Messages app reads).
 */
export function deviceSmsUrl(
  platform: SmsPlatform,
  phones: readonly string[],
  body: string,
): string {
  const numbers = phones.map((p) => p.replace(/[^\d+]/g, "")).filter(Boolean);
  const text = encodeURIComponent(body);
  if (platform === "ios") {
    return `sms:/open?addresses=${numbers.join(",")}&body=${text}`;
  }
  return `sms:${numbers.join(";")}?body=${text}`;
}

function coord(value: number): string {
  // Six decimals is about 10 cm: more says nothing and makes the text longer.
  return String(Math.round(value * 1e6) / 1e6);
}

/** A pin anyone can open, with or without Abonten (same as the directions sheet). */
export function mapsPinUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${coord(lat)},${coord(lng)}`;
}

export function mapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${coord(lat)},${coord(lng)}`;
}

/** The live page a contact opens. */
export function safetyViewPath(token: string): string {
  return `/sos/${token}`;
}

/** The page a new contact opens to accept or decline. */
export function safetyInvitePath(token: string): string {
  return `/trusted/${token}`;
}

/** Tokens are 22 base64url characters (128 bits). */
export const SAFETY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function isSafetyToken(value: unknown): value is string {
  return typeof value === "string" && SAFETY_TOKEN_PATTERN.test(value);
}

export function telUrl(number: string): string {
  return `tel:${number.replace(/[^\d+*#]/g, "")}`;
}

/** A WhatsApp chat with a listed number (digits only, country code first). */
export function whatsAppUrl(number: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}`;
}
