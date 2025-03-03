import { supabase } from "../config/supabase";

export const signInWithGoogle = async (location: string | null) => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/events?location=${
        location || "unknown"
      }`,
    },
  });

  if (error) throw error;
  return data;
};

export const signInWithPhone = async (phone: string) => {
  const { error } = await supabase.auth.signInWithOtp({ phone });

  if (error) throw error;
};

export const verifyOtp = async (phone: string, otp: string) => {
  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token: otp,
    type: "sms",
  });

  if (error) {
    console.log(error);

    if (error.message.includes("expired")) {
      throw new Error("OTP has expired. Please request a new one.");
    }
    throw error;
  }

  return data;
};

export const signOut = async () => {
  await supabase.auth.signOut();
};
