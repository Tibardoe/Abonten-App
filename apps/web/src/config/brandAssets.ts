import { PUBLIC_SITE_ORIGIN } from "@abonten/core/brand/socialLinks";

/**
 * Abonten's logo as PNGs, for the places that cannot use the SVG masters in
 * public/assets/images/brand: email clients (Outlook in particular doesn't
 * reliably render SVG) and the ticket PDF. The PNGs are generated from those
 * masters by apps/web/scripts/gen-brand-assets.mjs and served by this app.
 *
 * The stacked lockup (mark over the ABƆNTEN wordmark) on a white, rounded
 * tile, for every email (EmailParts). Emails can't detect the reader's theme,
 * and a `prefers-color-scheme` swap is ignored by Gmail's and Outlook's apps
 * (which darken the email themselves, making a transparent dark logo
 * invisible) and by Gmail's mobile web client and Outlook for Windows (which
 * showed both logos). On its own white tile the logo stays readable
 * everywhere. Absolute, because an email is read far from this site.
 */
export const ABONTEN_LOGO_EMAIL_TILE_URL = `${PUBLIC_SITE_ORIGIN}/assets/images/brand/abonten-email-tile.png`;

/**
 * The stacked lockup on a transparent background for the ticket PDF (always
 * printed on white). A same-origin path for the PDF built in the browser
 * (TicketModal) — a cross-origin fetch there would need CORS — and the
 * absolute URL for the PDF built on the server (generateTicketPdfBuffer).
 */
export const ABONTEN_PDF_LOGO_PATH =
  "/assets/images/brand/abonten-pdf-logo.png";
export const ABONTEN_PDF_LOGO_URL = `${PUBLIC_SITE_ORIGIN}${ABONTEN_PDF_LOGO_PATH}`;
