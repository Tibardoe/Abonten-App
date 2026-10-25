// The link preview for a page with no picture of its own: the logotype over
// the homepage photo (drawn by scripts/gen-brand-assets.mjs). A page that
// sets its own `openGraph` replaces the root layout's whole, so it names
// this again rather than losing the picture.
export const DEFAULT_SHARE_IMAGE = {
  url: "/assets/images/brand/og-default.jpg",
  width: 1200,
  height: 630,
  alt: "Abonten",
} as const;
