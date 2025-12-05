import { supabase } from "../config/supabase/client";

const hubtelApiUsername = process.env.NEXT_PUBLIC_HUBTEL_API_USERNAME;

const hubtelApiPassword = process.env.NEXT_PUBLIC_HUBTEL_API_PASSWORD;

export const signInWithGoogle = async (location: string | null) => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/events/location/${
        location || "unknown"
      }`,
    },
  });

  if (error) throw error;

  return data;
};

// Fetch User After OAuth Redirect
export const fetchAuthenticatedUser = async () => {
  try {
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      console.error("Authentication failed:", error?.message);
      throw new Error(error?.message || "No active session");
    }

    // await ensureUserInfoExists(data.user);

    return data.user;
  } catch (error) {
    console.error("User profile verification failed:", error);
    await supabase.auth.signOut(); // Prevent partial auth state
    throw error;
  }
};

export const signInWithPhone = async (phone: string) => {
  if (!hubtelApiUsername || !hubtelApiPassword) {
    console.log("Hubtel API username and password not found!");

    return;
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

  // const { error } = await supabase.auth.signInWithOtp({ phone });

  // if (error) throw error;
};

export const verifyOtp = async (
  requstId: string,
  prefix: string,
  code: string,
) => {
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

  console.log(response);

  if (response.status !== 200) {
    return { status: 401, message: "Verfication code incorrect!" };
  }

  // const { data, error } = await supabase.auth.verifyOtp({
  //   phone,
  //   token: otp,
  //   type: "sms",
  // });

  // if (error) {
  //   console.log(`Error verifying OTP: ${error.message}`);

  //   if (error.message.includes("expired")) {
  //     return {
  //       status: 401,
  //       message: "OTP has expired. Please request a new one.",
  //     };
  //     // throw new Error("OTP has expired. Please request a new one.");
  //   }
  //   throw error;
  // }

  // // Ensure user exists in `user_info` after phone sign-in
  // if (data?.user) {
  //   await ensureUserInfoExists(data?.user);
  // }

  // return { status: 200, data, message: "OTP verfied successfully!" };
};

export const updatePhoneNumberInUserTable = async (phone: string) => {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    console.error(
      "Could not authenticate user before updating phone.",
      userError?.message,
    );
    return { status: 401, message: "User not authenticated." };
  }

  const { error: updatePhoneNumberError } = await supabase.auth.updateUser({
    phone: phone,
  });

  if (updatePhoneNumberError) {
    console.log(
      `Error updating user phone number: ${updatePhoneNumberError.message}`,
    );

    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, message: "Phone number updated successfully." };
};

export const signOut = async () => {
  await supabase.auth.signOut();
  window.location.href = "/";
};
