"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import {
  type UpdateTicketTypeNotesCoreInput,
  type UpdateTicketTypeNotesCoreResult,
  updateTicketTypeNotesCore,
} from "@abonten/services/events/updateTicketTypeNotesCore";
import { tr } from "@abonten/services/i18n/requestLocale";

// Thin wrapper: auth, then delegate to the shared body (also used by the
// mobile PUT /api/mobile/organizer/events/:eventId/ticket-types/notes
// route). What each ticket type includes, changed on its own — allowed
// after the first sale, when the rest of the ticket editor is locked.
export default withActionLocale(async function updateTicketTypeNotes(
  input: UpdateTicketTypeNotesCoreInput,
): Promise<
  UpdateTicketTypeNotesCoreResult | { status: 401 | 403; message: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: tr("userNotAuthenticated") };
  }

  // Managing as a team: the chosen team, if the person's role covers this.
  const actor = await actingFor(user.id, "events.manage");

  if (actor.error) return actor.error;

  return updateTicketTypeNotesCore(supabase, actor.accountId, input);
});
