"use server";

import { createClient } from "@/config/supabase/server";
import nodemailer from "nodemailer";

// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     type: "OAuth2",
//     user: "abontenfunctions@gmail.com",
//     clientId: process.env.GOOGLE_CLIENT_ID,
//     clientSecret: process.env.GOOGLE_CLIENT_SECRET,
//     refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
//   },
// });

export default async function emailTicket() {
  const supabase = await createClient();

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (!user || userError) {
    console.log(`Error fetching user: ${userError?.message}`);

    return { status: 401, meesage: "User not logged in!" };
  }
}
