import { readFile } from "node:fs/promises";
import { join } from "node:path";
import TicketPdfDocument, {
  type PdfImageData,
} from "@/components/organisms/TicketPdfDocument";
import { ABONTEN_PDF_LOGO_URL } from "@/config/brandAssets";
import { PUBLIC_SITE_ORIGIN } from "@abonten/core/brand/socialLinks";
import {
  HTTP_TIMEOUTS,
  fetchWithTimeout,
} from "@abonten/core/http/fetchWithTimeout";
import { logger } from "@abonten/core/logger";
import {
  type TicketPdfData,
  ticketPdfLabels,
} from "@abonten/core/ticketPdfData";
import { coreTranslator } from "@abonten/i18n/server";
import { generateQRCodeDataURL } from "@abonten/services/tickets/generateTicketCode";
import { renderToBuffer } from "@react-pdf/renderer";
import {
  TICKET_PDF_FALLBACK_FONT,
  TICKET_PDF_FONT_PATHS,
  type TicketPdfFont,
  registerTicketPdfFont,
} from "./ticketPdfFont";

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
 * One of the receipt's font files: from this deployment's own files when
 * they are on disk (local, self-hosted), else from the site, where the
 * same file is a static asset.
 */
async function loadFontFile(path: string): Promise<Uint8Array> {
  try {
    return await readFile(join(process.cwd(), "public", path));
  } catch {
    const res = await fetchWithTimeout(`${PUBLIC_SITE_ORIGIN}${path}`, {
      timeoutMs: HTTP_TIMEOUTS.cloudinary,
    });
    if (!res.ok) throw new Error(`font ${path}: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}

let receiptFont: Promise<TicketPdfFont> | null = null;

/**
 * The receipt font, loaded once per server instance. A failure is not
 * remembered: this receipt is drawn in Helvetica and the next one tries
 * again.
 */
function loadReceiptFont(): Promise<TicketPdfFont> {
  if (!receiptFont) {
    receiptFont = Promise.all([
      loadFontFile(TICKET_PDF_FONT_PATHS.regular),
      loadFontFile(TICKET_PDF_FONT_PATHS.bold),
    ])
      .then(([regular, bold]) => registerTicketPdfFont({ regular, bold }))
      .catch((error) => {
        receiptFont = null;
        logger.warn("Ticket PDF: receipt font unavailable, using Helvetica", {
          error: error instanceof Error ? error.message : String(error),
        });
        return TICKET_PDF_FALLBACK_FONT;
      });
  }
  return receiptFont;
}

/**
 * Server-side counterpart to TicketModal's client-side `pdf().toBlob()` —
 * both render the exact same TicketPdfDocument, so the emailed PDF and the
 * one a user downloads from My Events are never two different designs.
 * `locale` is the buyer's language (the email's): `ticket` should have
 * been built with the same one so its dates match the words.
 */
export async function generateTicketPdfBuffer(
  ticket: TicketPdfData,
  locale: string | null | undefined,
): Promise<Buffer> {
  const [logo, flyer, qr, font] = await Promise.all([
    loadPdfImage(ABONTEN_PDF_LOGO_URL),
    loadPdfImage(ticket.flyerImageUrl),
    loadQr(ticket),
    loadReceiptFont(),
  ]);
  return renderToBuffer(
    <TicketPdfDocument
      ticket={ticket}
      labels={ticketPdfLabels(coreTranslator(locale), ticket)}
      images={{ logo, flyer, qr }}
      font={font}
    />,
  );
}
