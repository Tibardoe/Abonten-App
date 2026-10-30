"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { ticketCancelQuoteCore } from "@abonten/services/tickets/ticketCancelQuoteCore";

/**
 * What cancelling one of the caller's tickets would give back, and which of
 * the payment's other tickets would go with it, before the dialog opens.
 * Shared with POST /api/mobile/tickets/cancel/quote.
 */
export default withActionLocale(async function getTicketCancelQuote(
  ticketId: string,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401 as const, message: tr("userNotLoggedIn") };
  }

  return ticketCancelQuoteCore(supabase, user.id, ticketId);
});
