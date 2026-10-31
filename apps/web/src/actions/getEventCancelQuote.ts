"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { eventCancelQuoteCore } from "@abonten/services/tickets/cancelEventTicketsCore";

/**
 * What cancelling all of the caller's tickets for an event would give
 * back. Shared with POST /api/mobile/tickets/cancel-event/quote.
 */
export default withActionLocale(async function getEventCancelQuote(
  eventId: string,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401 as const, message: tr("userNotLoggedIn") };
  }

  return eventCancelQuoteCore(supabase, user.id, eventId);
});
