"use server";

import TicketPurchaseEmailTemplate from "@/components/organisms/TicketPurchaseEmailTemplate";
import { createClient } from "@/config/supabase/server";
import React from "react";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function ticketPurchaseNotification() {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (!userData?.user || userError) {
    console.log(`Error fetching user: ${userError?.message}`);
    return { status: 401, message: "User not logged in!" };
  }

  const email = userData.user.email ?? "";

  // Fetch username from your user_info table
  const { data: userInfo, error: infoError } = await supabase
    .from("user_info")
    .select("username")
    .eq("id", userData.user.id)
    .single();

  if (infoError) {
    console.log(`Error fetching user info: ${infoError.message}`);
    return { status: 500, message: "Error fetching user info" };
  }

  const username = userInfo?.username ?? null;

  const { data, error } = await resend.emails.send({
    from: "Abonten Hub <tickets@abontenhub.com>",
    to: [email],
    subject: "Your Abonten Ticket Is Ready 🎟️",
    react: TicketPurchaseEmailTemplate({ username }),

    // attachments: [
    //   {
    //     filename: "Ticket.pdf",
    //     content: "ticketpdf",
    //   },
    // ],
  });

  if (error) {
    return { status: 400, message: error };
  }

  return { status: 200, data };
}
