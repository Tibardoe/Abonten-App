// One text message through Hubtel's SMS API (POST sms.hubtel.com/v1/messages/
// send, Basic auth). Used by the phone-code provider (hubtelOtpProvider) and
// by Abonten Safety's texts to trusted contacts.
//
// The content is never logged or put in an error: for a phone code it IS
// the code, and a Safety text names a person and links to where they are.

import {
  HTTP_TIMEOUTS,
  fetchWithTimeout,
} from "@abonten/core/http/fetchWithTimeout";
import { logger } from "@abonten/core/logger";

const HUBTEL_SMS_SEND_URL = "https://sms.hubtel.com/v1/messages/send";
// Hubtel's ceiling for an alphanumeric sender ID. The ID must also be one
// Hubtel has approved for the account; an unapproved one is dropped by the
// networks without an error.
const SENDER_ID_MAX_LENGTH = 11;

export const HUBTEL_SMS_ENV = [
  "HUBTEL_API_CLIENT_ID",
  "HUBTEL_API_CLIENT_SECRET",
  "HUBTEL_SMS_SENDER_ID",
] as const;

type HubtelSmsSendResponse = {
  messageId?: string | null;
  status?: number | string;
  statusDescription?: string;
};

type HubtelSmsConfig = {
  clientId: string;
  clientSecret: string;
  senderId: string;
};

function config(): HubtelSmsConfig | null {
  const clientId = process.env.HUBTEL_API_CLIENT_ID;
  const clientSecret = process.env.HUBTEL_API_CLIENT_SECRET;
  const senderId = process.env.HUBTEL_SMS_SENDER_ID?.trim();
  if (!clientId || !clientSecret || !senderId) return null;
  if (senderId.length > SENDER_ID_MAX_LENGTH) {
    logger.error(
      `HUBTEL_SMS_SENDER_ID is ${senderId.length} characters; Hubtel allows ${SENDER_ID_MAX_LENGTH}.`,
    );
    return null;
  }
  return { clientId, clientSecret, senderId };
}

export function isHubtelSmsConfigured(): boolean {
  return config() !== null;
}

// Hubtel's numeric `status`: 0 accepted, 1 accepted for delivery. It says
// the request was taken, not that the phone received anything. A missing,
// null or empty status is not acceptance (Number() would read those as 0).
function accepted(status: unknown): boolean {
  const value =
    typeof status === "number"
      ? status
      : typeof status === "string" && status.trim() !== ""
        ? Number(status)
        : Number.NaN;
  return value === 0 || value === 1;
}

export type HubtelSmsResult =
  | { ok: true; messageId: string | null }
  | {
      ok: false;
      /** not_configured: no keys; refused: Hubtel said no; unreachable: no answer in time (it may still have sent). */
      reason: "not_configured" | "refused" | "unreachable";
      /** For logs and the outbox. Never contains the message. */
      detail: string;
    };

export async function sendHubtelSms(input: {
  toE164: string;
  content: string;
  clientReference: string;
  timeoutMs?: number;
}): Promise<HubtelSmsResult> {
  const creds = config();
  if (!creds) {
    return {
      ok: false,
      reason: "not_configured",
      detail: "Hubtel SMS credentials or sender ID are not configured.",
    };
  }
  let response: Response;
  let body: HubtelSmsSendResponse | null;
  try {
    response = await fetchWithTimeout(HUBTEL_SMS_SEND_URL, {
      timeoutMs: input.timeoutMs ?? HTTP_TIMEOUTS.hubtelOtp,
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}`,
      },
      body: JSON.stringify({
        From: creds.senderId,
        To: input.toE164.replace(/\D/g, ""),
        Content: input.content,
        ClientReference: input.clientReference,
      }),
    });
    body = (await response
      .json()
      .catch(() => null)) as HubtelSmsSendResponse | null;
  } catch (error) {
    return {
      ok: false,
      reason: "unreachable",
      detail: `Hubtel SMS send did not complete: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  // An unfunded account is HTTP 400 with status 12 "Payment required on
  // account" (seen 2026-09-20), so both numbers go into the detail.
  if (!response.ok || !body || !accepted(body.status)) {
    return {
      ok: false,
      reason: "refused",
      detail: `Hubtel SMS send refused (HTTP ${response.status}, status ${body?.status ?? "none"}): ${body?.statusDescription ?? "no readable body"}`,
    };
  }
  return { ok: true, messageId: body.messageId ?? null };
}
