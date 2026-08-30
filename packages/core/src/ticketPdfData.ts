import type { UserTicketType } from "@abonten/types/ticketType";
import { buildCloudinaryUrl } from "./cloudinaryUrl";
import { formatDateWithSuffix, getFormattedEventDate } from "./dateFormatter";

export type TicketPdfData = {
  ticketCode: string;
  status: string;
  issuedAt: string;
  ticketTypeName: string;
  eventTitle: string;
  eventAddress: string;
  eventDate: string;
  eventTime: string;
  flyerImageUrl: string;
  qrImageUrl: string;
  attendeeName?: string | null;
};

/**
 * Normalizes a UserTicketType (the same shape both My Events and the
 * purchase email fetch) into exactly what the canonical ticket PDF needs.
 * Used by both the client-side "Download As PDF" button and the
 * server-side email attachment, so the two can never render different data.
 */
export function buildTicketPdfData(
  ticket: UserTicketType,
  attendeeName?: string | null,
): TicketPdfData {
  const { date, time } = getFormattedEventDate(
    ticket.event.starts_at,
    ticket.event.ends_at,
    ticket.event.occurrences,
  );

  return {
    ticketCode: ticket.ticket_code,
    status: ticket.status,
    issuedAt: formatDateWithSuffix(ticket.issued_at),
    ticketTypeName: ticket.ticket_type.type,
    eventTitle: ticket.event.title,
    eventAddress: ticket.event.address?.full_address ?? "",
    eventDate: date,
    eventTime: time,
    flyerImageUrl: buildCloudinaryUrl(
      ticket.event.flyer_public_id,
      ticket.event.flyer_version,
      { width: 500, height: 224 },
    ),
    qrImageUrl: buildCloudinaryUrl(ticket.qr_public_id, ticket.qr_version, {
      width: 224,
      height: 224,
      lossless: true,
    }),
    attendeeName,
  };
}

/**
 * Ticket codes are always server-generated as `TKT-XXXXXXXX` (see
 * generateTicketCode.ts), so this is already filesystem/attachment-safe —
 * no further sanitization is needed, but the format is centralized here so
 * download and email always name the file the same way.
 */
export function buildTicketPdfFilename(ticketCode: string): string {
  return `Abonten-Ticket-${ticketCode}.pdf`;
}
