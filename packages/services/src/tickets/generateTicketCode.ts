import { newTicketCode } from "@abonten/core/ticketTransfers/ticketCode";
import QRCode from "qrcode";

/**
 * A new ticket's code: "TKT-" + 12 characters with a check character
 * (@abonten/core/ticketTransfers/ticketCode, decision X15). Tickets issued
 * before 2026-11-15 keep their "TKT-" + 8 hex codes.
 */
export function generateTicketCode() {
  return newTicketCode();
}

export async function generateQRCodeDataURL(ticketCode: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  const verifyURL = `${baseUrl}/verify/${ticketCode}`;

  const data = JSON.stringify(verifyURL);

  return await QRCode.toDataURL(data); // returns a base64 image string
}
