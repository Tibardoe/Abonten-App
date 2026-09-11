/**
 * Abonten's logo, hosted on Cloudinary (same account/CDN as event flyers and
 * ticket QR codes — see saveEventQrCodeToCloudinary.ts) and delivered as PNG
 * via Cloudinary's f_png transform, since the sources are SVGs
 * (public/assets/images/abonten-logo*.svg) and email clients — Outlook in
 * particular — don't reliably render SVG.
 *
 * The plain dark (black) logo on a transparent background. Used by the
 * ticket PDF (always printed on white), not by emails — see the tile below.
 */
export const ABONTEN_LOGO_EMAIL_LIGHT_URL =
  "https://res.cloudinary.com/abonten/image/upload/f_png,q_auto,w_480/v1786975388/branding/abonten-logo.png";

/**
 * The same logo on a white, rounded tile, for every email (EmailParts).
 * Emails can't detect the reader's theme, and the old light/dark swap with a
 * `prefers-color-scheme` media query is ignored by Gmail's and Outlook's apps
 * (which darken the email themselves, making a transparent black logo
 * invisible) and by Gmail's mobile web client and Outlook for Windows (which
 * showed both logos). On its own white tile the logo stays readable
 * everywhere, and is invisible against a white email in light mode.
 */
export const ABONTEN_LOGO_EMAIL_TILE_URL =
  "https://res.cloudinary.com/abonten/image/upload/w_480,b_white/bo_40px_solid_white,r_32/f_png,q_auto/v1786975388/branding/abonten-logo.png";
