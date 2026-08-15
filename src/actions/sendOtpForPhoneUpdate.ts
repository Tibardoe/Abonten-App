"use server";

import { createClient } from "@/config/supabase/server";
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

const client = twilio(accountSid, authToken);

const OTP_COOLDOWN_MS = 60 * 1000;
// Basic per-user cooldown to stop this from being SMS-bombed. In-memory, so
// it resets on cold start and doesn't share state across instances/replicas
// — enough to stop a single abusive client, not a distributed guarantee.
const lastSentAtByUserId = new Map<string, number>();

export default async function sendOtpForPhoneUpdate(phone: string) {
  if (!serviceSid) {
    return;
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { success: false, message: "User not logged in" };
  }

  const lastSentAt = lastSentAtByUserId.get(user.id);
  if (lastSentAt && Date.now() - lastSentAt < OTP_COOLDOWN_MS) {
    return {
      success: false,
      message: "Please wait a moment before requesting another code.",
    };
  }

  try {
    await client.verify.v2
      .services(serviceSid)
      .verifications.create({ to: phone, channel: "sms" });

    lastSentAtByUserId.set(user.id, Date.now());

    return { success: true, message: `OTP sent to ${phone}` };
  } catch (error) {
    console.error("Error sending OTP:", error);
    return { success: false, message: "Failed to send OTP" };
  }
}
