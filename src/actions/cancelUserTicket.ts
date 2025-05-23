"use server";

import { createClient } from "@/config/supabase/server";
import issueRefund from "./issueRefund";

export default async function cancelUserTicket(
  ticketId: string,
  transactionId: string | null,
  userId: string,
  eventId: string,
) {
  const supabase = await createClient();

  if (transactionId) {
    const { data: transaction, error: transactionError } = await supabase
      .from("transaction")
      .select("*")
      .eq("id", transactionId)
      .maybeSingle();

    if (transactionError || !transaction) {
      console.log(`Failed fetching transaction: ${transactionError?.message}`);

      return { status: 500, message: "Something went wrong!" };
    }

    if (transaction.amount > 0) {
      const response = await issueRefund(transaction);

      if (response.status !== 200) {
        console.log(response.message);
      }
    }
  }

  const { error: updateStatusError } = await supabase
    .from("ticket")
    .update({ status: "cancelled", updated_at: new Date() })
    .eq("id", ticketId);

  if (updateStatusError) {
    console.log(`Error updating ticket status:${updateStatusError.message}`);

    return { status: 500, message: "Something went wrong!" };
  }

  const { error: deleteFromAttendanceError } = await supabase
    .from("attendance")
    .delete()
    .eq("user_id", userId)
    .eq("event_id", eventId);

  if (deleteFromAttendanceError) {
    console.log(
      `Error deleting user attendance: ${deleteFromAttendanceError.message}`,
    );

    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, message: "Ticket cancelled successfully" };
}
