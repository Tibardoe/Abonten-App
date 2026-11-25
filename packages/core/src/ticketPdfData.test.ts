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
      ticketTypeValue: "Regular",
      ticketCode: "Ticket code",
      status: "Status",
      statusValue: "Active",
      location: "Location",
      date: "Date",
      qrCode: "Ticket QR code",
      gateNote: null,
    });
  });

  it("say who scans a partner gate's ticket, or that its code is coming", () => {
    expect(
      ticketPdfLabels(t, { ...data("active"), gate: "partner" }).gateNote,
    ).toBe("Scanned at the gate by the organiser's check-in system");
    expect(
      ticketPdfLabels(t, { ...data("active"), gate: "partner_pending" })
        .gateNote,
    ).toBe("Your gate code is on its way");
  });

  it("are the reader's language when they read another", () => {
    const labels = ticketPdfLabels(tFr, data("used"));
    expect(labels.title).toBe("Reçu");
    expect(labels.issuedOn).toBe("Émis le : 1 Oct 2026");
    expect(labels.ticketType).toBe("Type de billet");
    expect(labels.statusValue).toBe("Enregistré à l'entrée");
  });

  it("word a tier the system named, and keep one the organizer named", () => {
    const tier = (name: string, translate = t) =>
      ticketPdfLabels(translate, { ...data("active"), ticketTypeName: name })
        .ticketTypeValue;
    expect(tier("SINGLE TICKET")).toBe("Standard ticket");
    expect(tier("FREE")).toBe("Free");
    expect(tier("SINGLE TICKET", tFr)).toBe("Billet standard");
    expect(tier("FREE", tFr)).toBe("Gratuit");
    expect(tier("VIP", tFr)).toBe("VIP");
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

  it("prints a partner gate's code and QR instead of Abonten's", () => {
    const partner = buildTicketPdfData({
      ...ticket,
      partner_gate: "hapniin",
      partner_code: "TCK-A1B2C3",
      partner_qr_public_id: "tickets_qr_codes/gate-hapniin-TCK-A1B2C3",
      partner_qr_version: "5",
    } as UserTicketType);
    expect(partner.ticketCode).toBe("TCK-A1B2C3");
    expect(partner.qrImageUrl).toContain("gate-hapniin-TCK-A1B2C3");
    expect(partner.gate).toBe("partner");

    const pending = buildTicketPdfData({
      ...ticket,
      partner_gate: "hapniin",
    } as UserTicketType);
    expect(pending.ticketCode).toBe("");
    expect(pending.qrImageUrl).toBe("");
    expect(pending.gate).toBe("partner_pending");

    const own = buildTicketPdfData(ticket);
    expect(own.ticketCode).toBe("TKT-AB12CD34");
    expect(own.gate).toBeNull();
  });

  it("names the file the same for the download and the email", () => {
    expect(buildTicketPdfFilename("TKT-AB12CD34")).toBe(
      "Abonten-Ticket-TKT-AB12CD34.pdf",
    );
  });
});
