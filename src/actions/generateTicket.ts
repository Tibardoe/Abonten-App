"use server";

import { createClient } from "@/config/supabase/server";
import {
  generateQRCodeDataURL,
  generateTicketCode,
} from "@/utils/generateTicketCode";
import insertPromoCodeUsage from "./InsertPromoCodeUsage";
import insertUserAttendance from "./insertUserAttendance";
import { saveEventQrCodeToCloudinary } from "./saveEventQrCodeToCloudinary";

type TicketInput = {
  type: string;
  quantity: number;
};

export default async function generateTicket(
  eventId: string,
  ticketInputs: TicketInput[],
  promoCode: string | undefined,
  eventEndDate: Date,
  transactionId?: string,
  transactionMetada?: string,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.log(`Failed fetching user: ${userError.message}`);

    return {
      status: 500,
      message: "Something went wrong!",
    };
  }

  if (!user) {
    return { status: 401, message: "User not logged in" };
  }

  for (const input of ticketInputs) {
    // Get ticket type ID
    const { data: ticketType, error: ticketTypeError } = await supabase
      .from("ticket_type")
      .select("id")
      .eq("event_id", eventId)
      .eq("type", input.type.toUpperCase())
      .maybeSingle();

    if (ticketTypeError || !ticketType) {
      return {
        status: 404,
        message: `Ticket type ${input.type} not found`,
      };
    }

    for (let i = 0; i < input.quantity; i++) {
      const ticketCode = generateTicketCode();

      const qrCodeBase64 = await generateQRCodeDataURL(ticketCode);

      const uploadResponse = await saveEventQrCodeToCloudinary(
        qrCodeBase64,
        ticketCode,
      );

      if (uploadResponse.error) {
        console.log(
          `Error saving QR code to cloudinary:${uploadResponse.error}`,
        );

        return { status: 500, message: "Something went wrong!" };
      }

      const { data: insertedTicket, error: insertTicketError } = await supabase
        .from("ticket")
        .insert({
          user_id: user.id,
          ticket_type_id: ticketType.id,
          qr_public_id: uploadResponse.public_id,
          qr_version: uploadResponse.version,
          expires_at: eventEndDate,
          used_at: null,
          transaction_id: transactionId ?? null,
          seat_number: null,
          status: "active",
          ticket_code: ticketCode,
          metadata: transactionMetada ?? null,
          created_at: new Date(),
          updated_at: null,
        })
        .select("id")
        .maybeSingle();

      if (insertTicketError) {
        console.log(`Error inserting ticket: ${insertTicketError.message}`);

        return {
          status: 500,
          message: "Failed to insert ticket into database",
        };
      }

      if (!insertedTicket) {
        return {
          status: 500,
          message: "Ticket insertion failed — no ID returned",
        };
      }
    }

    if (promoCode) {
      const insertPromoCodeResponse = await insertPromoCodeUsage(promoCode);

      if (insertPromoCodeResponse.status !== 200) {
        console.log(insertPromoCodeResponse.message);

        return {
          status: insertPromoCodeResponse.status,
          message: insertPromoCodeResponse.message,
        };
      }
    }

    const attendanceInsertResponse = await insertUserAttendance(
      eventId,
      input.quantity,
      ticketType.id,
    );

    if (attendanceInsertResponse.status !== 200) {
      return {
        status: attendanceInsertResponse.status,
        message: attendanceInsertResponse.message,
      };
    }
  }

  return { status: 200, message: "Tickets generated successfully" };
}
