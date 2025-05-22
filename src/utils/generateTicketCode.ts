import { randomUUID } from "node:crypto";
import QRCode from "qrcode";

export function generateTicketCode() {
  return `TKT-${randomUUID().split("-")[0].toUpperCase()}`; // e.g., TKT-A1B2C3D4
}

export async function generateQRCodeDataURL(ticketCode: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  const verifyURL = `${baseUrl}/verify/${ticketCode}`;

  const data = JSON.stringify(verifyURL);

  return await QRCode.toDataURL(data); // returns a base64 image string
}
