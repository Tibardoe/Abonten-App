import type { UserTicketType } from "@abonten/types/ticketType";
import { describe, expect, it } from "vitest";
import { t, tFr } from "./i18n/testTranslator";
import {
  type TicketPdfData,
  buildTicketPdfData,
  buildTicketPdfFilename,
  ticketPdfLabels,
} from "./ticketPdfData";

const data = (status: string): TicketPdfData => ({
  ticketCode: "TKT-AB12CD34",
  status,
  issuedAt: "1 Oct 2026",
  ticketTypeName: "Regular",
  eventTitle: "Afro Night",
  eventAddress: "Accra",
  eventDate: "Sat 10 Oct 2026",
  eventTime: "7:00pm",
  flyerImageUrl: "",
  qrImageUrl: "",
});

describe("the receipt's words", () => {
  it("are English by default", () => {
    expect(ticketPdfLabels(t, data("active"))).toEqual({
      title: "Receipt",
      issuedOn: "Issued on: 1 Oct 2026",
      attendee: "Attendee",
      ticketType: "Ticket type",
      ticketCode: "Ticket code",
      status: "Status",
      statusValue: "Active",
      location: "Location",
      date: "Date",
      qrCode: "Ticket QR code",
    });
  });

  it("are the reader's language when they read another", () => {
    const labels = ticketPdfLabels(tFr, data("used"));
    expect(labels.title).toBe("Reçu");
    expect(labels.issuedOn).toBe("Émis le : 1 Oct 2026");
    expect(labels.ticketType).toBe("Type de billet");
    expect(labels.statusValue).toBe("Enregistré à l'entrée");
  });

  it("word the status instead of printing the stored code", () => {
    const said = (status: string) =>
      ticketPdfLabels(t, data(status)).statusValue;
    expect(said("active")).toBe("Active");
    expect(said("used")).toBe("Checked in");
    expect(said("cancelled")).toBe("Cancelled");
    expect(said("expired")).toBe("Expired");
    // A status added to the database later is never shown as its code.
    expect(said("on_hold")).toBe("Unknown");
  });
});

describe("the receipt's data", () => {
  const ticket = {
    ticket_code: "TKT-AB12CD34",
    status: "active",
    issued_at: "2026-10-01T09:30:00Z",
    qr_public_id: "tickets/qr/abc",
    qr_version: 3,
    ticket_type: { type: "Regular" },
    event: {
      title: "Afro Night",
      starts_at: "2026-10-10T19:00:00Z",
      ends_at: "2026-10-10T23:00:00Z",
      occurrences: null,
      timezone: "Africa/Accra",
      address: { full_address: "Osu, Accra" },
      flyer_public_id: "events/flyer/abc",
      flyer_version: 7,
    },
  } as unknown as UserTicketType;

  it("writes its dates in the reader's language", () => {
    const english = buildTicketPdfData(ticket, "Ama");
    const french = buildTicketPdfData(ticket, "Ama", "fr");
    expect(english.attendeeName).toBe("Ama");
    expect(english.issuedAt).toMatch(/Oct 2026$/);
    expect(french.issuedAt).toMatch(/oct\.? 2026$/);
    expect(french.eventDate).not.toBe(english.eventDate);
    // The event's own clock either way.
    expect(french.eventTime).toContain("19");
  });

  it("names the file the same for the download and the email", () => {
    expect(buildTicketPdfFilename("TKT-AB12CD34")).toBe(
      "Abonten-Ticket-TKT-AB12CD34.pdf",
    );
  });
});
