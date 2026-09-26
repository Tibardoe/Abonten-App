import TicketPdfDocument, {
  type PdfImageData,
} from "@/components/organisms/TicketPdfDocument";
import { ABONTEN_LOGO_EMAIL_LIGHT_URL } from "@/config/brandAssets";
import {
  HTTP_TIMEOUTS,
  fetchWithTimeout,
} from "@abonten/core/http/fetchWithTimeout";
import { logger } from "@abonten/core/logger";
import type { TicketPdfData } from "@abonten/core/ticketPdfData";
import { generateQRCodeDataURL } from "@abonten/services/tickets/generateTicketCode";
import { renderToBuffer } from "@react-pdf/renderer";

/**
 * Fetches an image for the PDF, or null when it cannot be used: a missing
 * asset, a network error, or a format react-pdf cannot draw. The email is
 * sent either way; a ticket without its flyer is still a ticket.
 */
async function loadPdfImage(url: string): Promise<PdfImageData | null> {
  try {
    const res = await fetchWithTimeout(url, {
      timeoutMs: HTTP_TIMEOUTS.cloudinary,
    });
    if (!res.ok) return null;
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length > 8 && data.readUInt32BE(0) === 0x89504e47) {
      return { data, format: "png" };
    }
    if (data.length > 2 && data.readUInt16BE(0) === 0xffd8) {
      return { data, format: "jpg" };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * The QR is what gets someone through the door, so a QR image that cannot
 * be fetched is drawn again from the ticket code — the same content
 * issuance encoded (generateQRCodeDataURL), not a placeholder.
 */
async function loadQr(ticket: TicketPdfData): Promise<PdfImageData | null> {
  const fetched = await loadPdfImage(ticket.qrImageUrl);
  if (fetched) return fetched;
  try {
    const dataUrl = await generateQRCodeDataURL(ticket.ticketCode);
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    logger.warn("Ticket PDF: QR image unavailable, redrew it from the code", {
      ticketCode: ticket.ticketCode,
    });
    return { data: Buffer.from(base64, "base64"), format: "png" };
  } catch (error) {
    logger.error("Ticket PDF: could not draw the QR code", error);
    return null;
  }
}

/**
 * Server-side counterpart to TicketModal's client-side `pdf().toBlob()` —
 * both render the exact same TicketPdfDocument, so the emailed PDF and the
 * one a user downloads from My Events are never two different designs.
 */
export async function generateTicketPdfBuffer(
  ticket: TicketPdfData,
): Promise<Buffer> {
  const [logo, flyer, qr] = await Promise.all([
    loadPdfImage(ABONTEN_LOGO_EMAIL_LIGHT_URL),
    loadPdfImage(ticket.flyerImageUrl),
    loadQr(ticket),
  ]);
  return renderToBuffer(
    <TicketPdfDocument ticket={ticket} images={{ logo, flyer, qr }} />,
  );
}
