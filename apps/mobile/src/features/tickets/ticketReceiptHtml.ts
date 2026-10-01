import { PUBLIC_SITE_ORIGIN } from "@abonten/core/brand/socialLinks";
import type {
  TicketPdfData,
  TicketPdfLabels,
} from "@abonten/core/ticketPdfData";

// The stacked Abonten logo as a PNG — the same asset the web ticket PDF uses.
// Mirrors apps/web/src/config/brandAssets.ts `ABONTEN_PDF_LOGO_URL`; kept in
// sync by hand (it's a stable branding URL served by the web app).
const ABONTEN_LOGO_URL = `${PUBLIC_SITE_ORIGIN}/assets/images/brand/abonten-pdf-logo.png`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * HTML mirror of the web `TicketPdfDocument` (@react-pdf/renderer). Fed to
 * `expo-print` to produce the PDF a user downloads from the app — same
 * layout, colours and fields as the emailed attachment and the web
 * "Download As PDF" button, so the three can't drift into different designs.
 */
export function buildTicketReceiptHtml(
  ticket: TicketPdfData,
  /** The same words as the web ticket PDF (ticketPdfLabels). */
  labels: TicketPdfLabels,
): string {
  const activeStatus = ticket.status === "active" || ticket.status === "used";
  const attendeeRow = ticket.attendeeName
    ? `<div class="row"><span class="label">${escapeHtml(labels.attendee)}</span><span class="value">${escapeHtml(
        ticket.attendeeName,
      )}</span></div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #1a1a1a;
    padding: 32px;
    font-size: 12px;
  }
  .logo { display: block; width: 120px; margin: 0 auto 16px; }
  .heading { font-size: 26px; font-weight: 700; text-align: center; margin-bottom: 4px; }
  .issued { font-size: 11px; color: #6b7280; text-align: center; margin-bottom: 20px; }
  .card { border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden; }
  .flyer { width: 100%; height: 200px; object-fit: cover; display: block; }
  .card-body { padding: 16px; }
  .title { font-size: 17px; font-weight: 700; margin-bottom: 12px; }
  .row { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 8px; }
  .label { color: #6b7280; }
  .value { font-weight: 700; text-align: right; }
  .status-active { font-weight: 700; color: #16a34a; }
  .status-other { font-weight: 700; color: #dc2626; }
  .qr-wrap { margin-top: 16px; text-align: center; }
  .qr { width: 180px; height: 180px; }
  .footer { margin-top: 16px; font-size: 10px; color: #6b7280; text-align: right; }
</style>
</head>
<body>
  <img class="logo" src="${ABONTEN_LOGO_URL}" alt="Abonten" />
  <div class="heading">${escapeHtml(labels.title)}</div>
  <div class="issued">${escapeHtml(labels.issuedOn)}</div>

  <div class="card">
    <img class="flyer" src="${escapeHtml(ticket.flyerImageUrl)}" alt="${escapeHtml(
      ticket.eventTitle,
    )}" />
    <div class="card-body">
      <div class="title">${escapeHtml(ticket.eventTitle)}</div>
      ${attendeeRow}
      <div class="row"><span class="label">${escapeHtml(labels.ticketType)}</span><span class="value">${escapeHtml(
        ticket.ticketTypeName,
      )}</span></div>
      <div class="row"><span class="label">${escapeHtml(labels.ticketCode)}</span><span class="value">${escapeHtml(
        ticket.ticketCode,
      )}</span></div>
      <div class="row"><span class="label">${escapeHtml(labels.status)}</span><span class="${
        activeStatus ? "status-active" : "status-other"
      }">${escapeHtml(labels.statusValue)}</span></div>
      <div class="row"><span class="label">${escapeHtml(labels.location)}</span><span class="value">${escapeHtml(
        ticket.eventAddress,
      )}</span></div>
      <div class="row"><span class="label">${escapeHtml(labels.date)}</span><span class="value">${escapeHtml(
        `${ticket.eventDate} ${ticket.eventTime}`.trim(),
      )}</span></div>
      <div class="qr-wrap"><img class="qr" src="${escapeHtml(
        ticket.qrImageUrl,
      )}" alt="${escapeHtml(labels.qrCode)}" /></div>
      <div class="footer">www.abontenhub.com</div>
    </div>
  </div>
</body>
</html>`;
}
