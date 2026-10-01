import type { UserTicketType } from "@abonten/types/ticketType";
import { buildCloudinaryUrl } from "./cloudinaryUrl";
import { formatDateWithSuffix, getFormattedEventDate } from "./dateFormatter";
import type { CoreTranslator } from "./i18n/translator";

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
 * `locale` is the language of the person the receipt is for: its dates are
 * written in it (the buyer's saved language for the emailed PDF).
 */
export function buildTicketPdfData(
  ticket: UserTicketType,
  attendeeName?: string | null,
  locale?: string | null,
): TicketPdfData {
  const { date, time } = getFormattedEventDate(
    ticket.event.starts_at,
    ticket.event.ends_at,
    ticket.event.occurrences,
    ticket.event.timezone,
    locale,
  );

  return {
    ticketCode: ticket.ticket_code,
    status: ticket.status,
    issuedAt: formatDateWithSuffix(ticket.issued_at, undefined, locale),
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

/** The words printed on the receipt, in the reader's language. */
export type TicketPdfLabels = {
  title: string;
  issuedOn: string;
  attendee: string;
  ticketType: string;
  ticketCode: string;
  status: string;
  /** The ticket's status as a word (never the stored code). */
  statusValue: string;
  location: string;
  date: string;
  qrCode: string;
};

/**
 * The receipt's words from a `core` translator. The three places that draw
 * the receipt (the browser download, the emailed attachment, the app's
 * share sheet) all use this, so none of them needs a React hook inside a
 * PDF renderer and none can word the receipt differently.
 */
export function ticketPdfLabels(
  t: CoreTranslator,
  ticket: TicketPdfData,
): TicketPdfLabels {
  return {
    title: t("ticketReceipt.title"),
    issuedOn: t("ticketReceipt.issuedOn", { date: ticket.issuedAt }),
    attendee: t("ticketReceipt.attendee"),
    ticketType: t("ticketReceipt.ticketType"),
    ticketCode: t("ticketReceipt.ticketCode"),
    status: t("ticketReceipt.status"),
    statusValue: t("ticketReceipt.statusValue", { status: ticket.status }),
    location: t("ticketReceipt.location"),
    date: t("ticketReceipt.date"),
    qrCode: t("ticketReceipt.qrCode"),
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
