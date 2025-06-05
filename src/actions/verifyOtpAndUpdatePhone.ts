"use server";

import { updatePhoneNumberInUserTable } from "@/services/authService";
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

const client = twilio(accountSid, authToken);

export default async function verifyPhoneUpdateOtp(phone: string, otp: string) {
  if (!serviceSid) {
    return;
  }

  try {
    const verification = await client.verify.v2
      .services(serviceSid)
      .verificationChecks.create({
        to: phone,
        code: otp,
      });

    if (verification.status === "approved") {
      const updatePhoneResponse = await updatePhoneNumberInUserTable(phone);

      if (updatePhoneResponse.status !== 200) {
        return {
          status: updatePhoneResponse.status,
          message: updatePhoneResponse.message,
        };
      }

      return { status: 200, message: "OTP verified successfully!" };
    }
    return { status: 400, message: "Invalid OTP" };
  } catch (error) {
    console.error("Verification error:", error);
    return { status: 500, message: "Verification failed" };
  }

  // const phoneUpdateResponse = await updatePhoneNumberInUserTable(phone);

  // if (phoneUpdateResponse?.status !== 200) {
  //   return {
  //     status: phoneUpdateResponse?.status,
  //     message: phoneUpdateResponse?.message,
  //   };
  // }

  // return { status: 200, data, message: "OTP verfied successfully!" };
}
