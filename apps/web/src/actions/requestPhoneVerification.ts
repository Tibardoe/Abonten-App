"use server";

import {
  type PhoneOtpSendResult,
  sendPhoneOtpCore,
} from "@abonten/services/profile/phoneOtpSendCore";
import type { PhoneOtpPurpose } from "@abonten/services/profile/phoneOtpStore";
import { headers } from "next/headers";

// Caller IP for the per-address cap. On Vercel x-forwarded-for is set by the
// platform (a value the client sends is overwritten); elsewhere it can be
// client-influenced, so it is only ever one layer on top of the per-number
// cooldown and caps the core claims atomically.
async function getCallerIp(): Promise<string | null> {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || null;
}

export type RequestPhoneVerificationResult = PhoneOtpSendResult;

// Shared by phone sign-in (AuthModal), Settings -> Security's add/change-
// phone flow and the mobile route. The market of the number's country
// decides which provider sends the code (Hubtel in Ghana, Twilio Verify
// elsewhere); the provider's request handle is kept server-side and never
// sent to the client. `codeLength` tells the client how many digits to ask
// for.
export default async function requestPhoneVerification(
  dialCode: string,
  rawPhone: string,
  purpose: PhoneOtpPurpose,
): Promise<RequestPhoneVerificationResult> {
  // Anyone can call a Server Action with any arguments. The Field Ops owner
  // code has its own signed-in flow; sent from here it would replace the
  // code a Field Ops member just sent that owner.
  if (purpose !== "sign-in" && purpose !== "phone-update") {
    return { status: 400, message: "Enter a valid phone number." };
  }
  return sendPhoneOtpCore({
    dialCode,
    rawPhone,
    purpose,
    ipAddress: await getCallerIp(),
  });
}
