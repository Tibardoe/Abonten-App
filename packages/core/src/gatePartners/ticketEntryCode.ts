// Which code a ticket is checked in with (docs/architecture/
// gate-partner-connectors.md). Most tickets: Abonten's own code and QR.
// A ticket for an event whose gate is run by a partner's system: the
// partner's code and QR, or "on its way" until the partner has issued it.
// Every surface that shows a ticket's code or QR (website, app, email, the
// PDF receipt) asks this one function.

export type TicketEntryCode =
  | {
      kind: "abonten";
      code: string | null;
      qrPublicId: string | null;
      qrVersion: string | null;
    }
  | {
      kind: "partner";
      provider: string;
      code: string;
      qrPublicId: string | null;
      qrVersion: string | null;
    }
  | { kind: "partner_pending"; provider: string };

export type TicketEntryCodeSource = {
  ticket_code?: string | null;
  qr_public_id?: string | null;
  qr_version?: string | null;
  partner_gate?: string | null;
  partner_code?: string | null;
  partner_qr_public_id?: string | null;
  partner_qr_version?: string | null;
};

export function ticketEntryCode(
  ticket: TicketEntryCodeSource,
): TicketEntryCode {
  if (ticket.partner_gate) {
    const code = ticket.partner_code?.trim();
    if (!code)
      return { kind: "partner_pending", provider: ticket.partner_gate };
    return {
      kind: "partner",
      provider: ticket.partner_gate,
      code,
      qrPublicId: ticket.partner_qr_public_id ?? null,
      qrVersion: ticket.partner_qr_version ?? null,
    };
  }
  return {
    kind: "abonten",
    code: ticket.ticket_code ?? null,
    qrPublicId: ticket.qr_public_id ?? null,
    qrVersion: ticket.qr_version ?? null,
  };
}

/** The code to print or read out, or null while it is on its way. */
export function ticketEntryCodeText(
  ticket: TicketEntryCodeSource,
): string | null {
  const entry = ticketEntryCode(ticket);
  return entry.kind === "partner_pending" ? null : entry.code;
}
