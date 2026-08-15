"use server";

const hubtelApiUsername = process.env.HUBTEL_API_USERNAME;
const hubtelApiPassword = process.env.HUBTEL_API_PASSWORD;

export default async function sendPhoneOtp(phone: string) {
  if (!hubtelApiUsername || !hubtelApiPassword) {
    console.log("Hubtel API username and password not found!");

    return { status: 500, message: "Something went wrong!" };
  }

  const response = await fetch("https://api-otp.hubtel.com/otp/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Basic ${Buffer.from(
        `${hubtelApiUsername}:${hubtelApiPassword}`,
      ).toString("base64")}`,
    },
    body: JSON.stringify({
      senderId: hubtelApiUsername,
      phoneNumber: phone,
      countryCode: "GH",
    }),
  });

  const data = await response.json();

  if (data.code !== "0000") {
    console.log(`Error sending otp code: ${data.message}`);

    return { status: 400, message: data.message };
  }

  return { status: 200, data };
}
