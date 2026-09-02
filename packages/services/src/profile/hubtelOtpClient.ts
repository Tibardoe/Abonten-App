import { logger } from "@abonten/core/logger";
// Hubtel's dedicated OTP prepare/verify API — kept exactly as already
// integrated (Hubtel generates and stores the code itself; this app never
// sees or checks the code value directly, only Hubtel's verdict). Isolated
// here so the HTTP/credential details live in one server-only place instead
// of being duplicated across Server Actions. Never import from a "use
// client" file — HUBTEL_API_USERNAME/PASSWORD must never reach the browser
// bundle.

const HUBTEL_OTP_SEND_URL = "https://api-otp.hubtel.com/otp/send";
const HUBTEL_OTP_VERIFY_URL = "https://api-otp.hubtel.com/otp/verify";

export type HubtelOtpSendResponse = {
  code: string;
  message: string;
  data?: {
    prefix: string;
    requestId: string;
  };
};

export type HubtelOtpSendResult =
  | { ok: true; requestId: string; prefix: string }
  | { ok: false; message: string };

export type HubtelOtpVerifyResult =
  | { ok: true }
  | { ok: false; message: string };

function getHubtelCredentials(): {
  clientId: string;
  clientSecret: string;
} | null {
  const clientId = process.env.HUBTEL_API_CLIENT_ID;
  const clientSecret = process.env.HUBTEL_API_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  return { clientId, clientSecret };
}

function buildAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export async function sendHubtelOtp(
  phoneE164: string,
): Promise<HubtelOtpSendResult> {
  const credentials = getHubtelCredentials();

  if (!credentials) {
    logger.error("Hubtel API credentials are not configured.");
    return { ok: false, message: "Something went wrong. Please try again." };
  }

  const response = await fetch(HUBTEL_OTP_SEND_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: buildAuthHeader(
        credentials.clientId,
        credentials.clientSecret,
      ),
    },
    body: JSON.stringify({
      senderId: credentials.clientId,
      phoneNumber: phoneE164,
      countryCode: "GH",
    }),
  });

  const data = (await response.json()) as HubtelOtpSendResponse;

  if (data.code !== "0000" || !data.data?.requestId || !data.data?.prefix) {
    logger.error(`Hubtel OTP send failed: ${data.message}`);
    return {
      ok: false,
      message: "Couldn't send the verification code. Please try again.",
    };
  }

  return { ok: true, requestId: data.data.requestId, prefix: data.data.prefix };
}

export async function verifyHubtelOtp(
  requestId: string,
  prefix: string,
  code: string,
): Promise<HubtelOtpVerifyResult> {
  const credentials = getHubtelCredentials();

  if (!credentials) {
    logger.error("Hubtel API credentials are not configured.");
    return { ok: false, message: "Something went wrong. Please try again." };
  }

  const response = await fetch(HUBTEL_OTP_VERIFY_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: buildAuthHeader(
        credentials.clientId,
        credentials.clientSecret,
      ),
    },
    body: JSON.stringify({ requestId, prefix, code }),
  });

  if (response.status !== 200) {
    return { ok: false, message: "That code is incorrect." };
  }

  return { ok: true };
}
