import TicketPdfDocument from "@/components/organisms/TicketPdfDocument";
import type { TicketPdfData } from "@abonten/core/ticketPdfData";
import { renderToBuffer } from "@react-pdf/renderer";

/**
 * Server-side counterpart to TicketModal's client-side `pdf().toBlob()` —
 * both render the exact same TicketPdfDocument, so the emailed PDF and the
 * one a user downloads from My Events are never two different designs.
 */
export async function generateTicketPdfBuffer(
  ticket: TicketPdfData,
): Promise<Buffer> {
  return renderToBuffer(<TicketPdfDocument ticket={ticket} />);
}
