"use server";

import { createClient } from "@/config/supabase/server";
import { releaseTicketQuantity } from "@/utils/ticketInventory";
import issueRefund from "./issueRefund";

export default async function cancelUserTicket(
  ticketId: string,
  transactionId: string | null,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  const { data: ticket, error: ticketError } = await supabase
    .from("ticket")
    .select("ticket_type_id")
    .eq("id", ticketId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (ticketError || !ticket) {
    console.log(`Failed fetching ticket: ${ticketError?.message}`);
    return { status: 404, message: "Ticket not found" };
  }

  if (transactionId) {
    const { data: transaction, error: transactionError } = await supabase
      .from("transaction")
      .select("*")
      .eq("id", transactionId)
      .eq("user_id", user.id)
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
    .eq("id", ticketId)
    .eq("user_id", user.id);

  if (updateStatusError) {
    console.log(`Error updating ticket status:${updateStatusError.message}`);

    return { status: 500, message: "Something went wrong!" };
  }

  const { error: deleteFromAttendanceError } = await supabase
    .from("attendance")
    .delete()
    .eq("ticket_id", ticketId)
    .eq("user_id", user.id);

  if (deleteFromAttendanceError) {
    console.log(
      `Error deleting user attendance: ${deleteFromAttendanceError.message}`,
    );

    return { status: 500, message: "Something went wrong!" };
  }

  await releaseTicketQuantity(ticket.ticket_type_id, 1);

  return { status: 200, message: "Ticket cancelled successfully" };
}
