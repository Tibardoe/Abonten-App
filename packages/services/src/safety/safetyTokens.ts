import { createHash } from "node:crypto";
import { PUBLIC_SITE_ORIGIN } from "@abonten/core/brand/socialLinks";
import { safetyInvitePath, safetyViewPath } from "@abonten/core/safety/links";
import { deriveSigningKey, hmacBase64Url } from "../security/signing";

// The links Abonten Safety texts to people. A token is an HMAC of the row id
// (a contact for an invite, a session recipient for the live page) with a
// key derived from the service-role key, cut to 128 bits so the text stays
// short. Only its SHA-256 is stored, so the table never holds a usable link,
// and the dispatcher can rebuild a token for a retry from the id alone.
// Rotating the service-role key invalidates every link sent before.

const VIEW_PURPOSE = "safety-view:v1";
const INVITE_PURPOSE = "safety-invite:v1";

function token(purpose: string, id: string): string {
  // base64url of 32 bytes is 43 characters; 22 of them are 132 bits.
  return hmacBase64Url(deriveSigningKey(purpose), id).slice(0, 22);
}

export function viewTokenFor(recipientId: string): string {
  return token(VIEW_PURPOSE, recipientId);
}

export function inviteTokenFor(contactId: string): string {
  return token(INVITE_PURPOSE, contactId);
}

export function safetyTokenHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** The site the links point at: this deployment's own when it says so. */
export function safetyOrigin(): string {
  return (process.env.WEB_BASE_URL || PUBLIC_SITE_ORIGIN).replace(/\/+$/, "");
}

export function viewUrlFor(recipientId: string): string {
  return `${safetyOrigin()}${safetyViewPath(viewTokenFor(recipientId))}`;
}

export function inviteUrlFor(contactId: string): string {
  return `${safetyOrigin()}${safetyInvitePath(inviteTokenFor(contactId))}`;
}
