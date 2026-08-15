"use server";

const hubtelApiUsername = process.env.HUBTEL_API_USERNAME;
const hubtelApiPassword = process.env.HUBTEL_API_PASSWORD;

export default async function verifyPhoneOtp(
  requstId: string,
  prefix: string,
  code: string,
) {
  const response = await fetch("https://api-otp.hubtel.com/otp/verify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Basic ${Buffer.from(
        `${hubtelApiUsername}:${hubtelApiPassword}`,
      ).toString("base64")}`,
    },
    body: JSON.stringify({
      requestId: requstId,
      prefix: prefix,
      code: code,
    }),
  });

  if (response.status !== 200) {
    return { status: 401, message: "Verfication code incorrect!" };
  }

  return { status: 200 };
}
