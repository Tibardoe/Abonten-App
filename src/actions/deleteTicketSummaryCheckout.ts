"use server";

import { createClient } from "@/config/supabase/server";

export default async function deleteTicketSummaryCHeckout(checkoutId: string) {
  const supabase = await createClient();
}
