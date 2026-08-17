/**
 * Abonten's logo, hosted on Cloudinary (same account/CDN as event flyers and
 * ticket QR codes — see saveEventQrCodeToCloudinary.ts) and delivered as PNG
 * via Cloudinary's f_png transform, since the sources are SVGs
 * (public/assets/images/abonten-logo*.svg) and email clients — Outlook in
 * particular — don't reliably render SVG.
 *
 * Two variants are hosted, matching the light/dark pair the app itself
 * already uses for the same purpose (see Header.tsx's resolvedTheme switch):
 * a dark (black) logo for light backgrounds, and a light (white) logo for
 * dark backgrounds. Emails can't run JS to detect the recipient's theme like
 * the app does, so the email template picks between them with a
 * `prefers-color-scheme` CSS media query instead — a black logo on a
 * transparent background is otherwise unreadable once a mail client (Gmail,
 * Apple Mail, Outlook) puts a dark background behind the email in dark mode.
 */
export const ABONTEN_LOGO_EMAIL_LIGHT_URL =
  "https://res.cloudinary.com/abonten/image/upload/f_png,q_auto,w_480/v1786975388/branding/abonten-logo.png";

export const ABONTEN_LOGO_EMAIL_DARK_URL =
  "https://res.cloudinary.com/abonten/image/upload/f_png,q_auto,w_480/v1786977808/branding/abonten-logo-white.png";
