// Abonten's official public channels. Web footers, the mobile drawer and the
// public documents all read from here so a link is only ever changed in one
// place (scripts/check-docs.mjs asserts these exact URLs appear where they
// should). Only accounts that actually exist are listed — a dead social icon
// is worse than none.

export type SocialLink = {
  key: "x" | "instagram" | "tiktok";
  label: string;
  href: string;
};

export const SOCIAL_LINKS: readonly SocialLink[] = [
  {
    key: "x",
    label: "X (formerly Twitter)",
    href: "https://x.com/abontenhub?s=11&t=gZ2B02snHyBqRmj-V9sbhg",
  },
  {
    key: "instagram",
    label: "Instagram",
    href: "https://www.instagram.com/abontenhub?stkn=N3M1N2ZmMHp5YTN0&utm_source=qr",
  },
  {
    key: "tiktok",
    label: "TikTok",
    href: "https://www.tiktok.com/@abontenhub?_r=1&_t=ZS-99ce4w5TDZx",
  },
];

/** Canonical public origin. The mobile app builds absolute legal/help links from it. */
export const PUBLIC_SITE_ORIGIN = "https://abontenhub.com";

export const LEGAL_PATHS = {
  index: "/legal",
  terms: "/legal/terms",
  privacy: "/legal/privacy",
  cookies: "/legal/cookies",
  security: "/legal/security",
} as const;

export const HELP_PATH = "/help";
