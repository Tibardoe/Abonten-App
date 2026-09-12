// Official contact channels, designated by the founder on 2026-09-12 as
// Google Workspace aliases on the abontenhub.com domain. The public legal
// pages, the help centre, the restricted-account page, the footers and the
// mobile drawer all read from here; scripts/check-docs.mjs asserts the legal
// pages quote exactly these addresses and that no other @abontenhub.com or
// personal address appears in documentation.
//
// The in-app support conversation remains the primary support channel (it
// is tied to a signed-in account). Email exists for people who cannot sign
// in, for privacy requests, and for security reports.

export const CONTACT_DOMAIN = "abontenhub.com";

export const SUPPORT_EMAIL = `support@${CONTACT_DOMAIN}`;
export const PRIVACY_EMAIL = `privacy@${CONTACT_DOMAIN}`;
export const SECURITY_EMAIL = `security@${CONTACT_DOMAIN}`;

export type ContactChannel = {
  key: "support" | "privacy" | "security";
  label: string;
  email: string;
};

export const CONTACT_CHANNELS: readonly ContactChannel[] = [
  { key: "support", label: "Support", email: SUPPORT_EMAIL },
  { key: "privacy", label: "Privacy", email: PRIVACY_EMAIL },
  { key: "security", label: "Security", email: SECURITY_EMAIL },
];

export function mailto(email: string, subject?: string): string {
  return subject
    ? `mailto:${email}?subject=${encodeURIComponent(subject)}`
    : `mailto:${email}`;
}
