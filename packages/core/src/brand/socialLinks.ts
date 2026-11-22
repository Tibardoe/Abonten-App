// Abonten's official public channels. Web footers, the mobile drawer, the
// "Follow Abonten" blocks (after a purchase, in the ticket email, on Abonten
// Weekly) and the public documents all read from here so a link is only ever
// changed in one place (scripts/check-docs.mjs asserts these exact URLs
// appear where they should). Only accounts that actually exist are listed —
// a dead social icon is worse than none.

export type SocialNetwork = "x" | "instagram" | "tiktok" | "whatsapp";

export type SocialLink = {
  /** Picks the icon and the accessible name (`common:abontenOnNetwork.<key>`). */
  key: SocialNetwork;
  /**
   * The network's own name, never translated. Shown beside the icon in the
   * Follow Abonten blocks and as the link text in emails; the name read out
   * is the catalog's, which contains it.
   */
  label: string;
  href: string;
  /**
   * A profile page that says who Abonten is, listed as the homepage
   * Organization's schema.org `sameAs`. The WhatsApp Channel is not one: its
   * address is an opaque invite code with no handle, whose web page only
   * offers to open WhatsApp, so it tells a search engine nothing about the
   * organization (and changes if the channel is ever made again).
   */
  profile: boolean;
};

export const SOCIAL_LINKS: readonly SocialLink[] = [
  {
    key: "x",
    label: "X",
    href: "https://x.com/abontenhub?s=11&t=gZ2B02snHyBqRmj-V9sbhg",
    profile: true,
  },
  {
    key: "instagram",
    label: "Instagram",
    href: "https://www.instagram.com/abontenhub?stkn=N3M1N2ZmMHp5YTN0&utm_source=qr",
    profile: true,
  },
  {
    key: "tiktok",
    label: "TikTok",
    href: "https://www.tiktok.com/@abontenhub?_r=1&_t=ZS-99ce4w5TDZx",
    profile: true,
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    href: "https://whatsapp.com/channel/0029Vb9N5fXCRs1lYPBl7Q00",
    profile: false,
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
