import { logger } from "@abonten/core/logger";
import {
  normalizeTicketTypeNote,
  ticketTypeNoteProblem,
  ticketTypeNoteProblemMessage,
} from "@abonten/core/ticketTypeNote";
import { userFacingError } from "@abonten/core/userFacingError";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { coreT, tr } from "../i18n/requestLocale";

// What each ticket type of an event includes (ticket_type.description,
// PROJECT.md §90), changed on its own. The full ticket editor
// (updateEventTicketTypesCore) locks after the first sale because prices
// and stock carry money; a note carries none, so it stays editable here
// before and after sales. Only `description` is written, by the caller's
// own client: the organizer update rule on ticket_type (acting_accounts
// events.manage) is the database's check, the event lookup below the
// friendly one. Post-auth body of the web updateTicketTypeNotes action and
// PUT /api/mobile/organizer/events/:eventId/ticket-types/notes. NOT "use
// server".

export type UpdateTicketTypeNotesCoreInput = {
  eventId: string;
  notes: { ticketTypeId: string; description: string | null }[];
};

export type UpdateTicketTypeNotesCoreResult = {
  status: 200 | 400 | 404 | 500;
  message: string;
};

/** More ticket types than any event has; a guard against a huge body. */
const MAX_NOTES = 100;

export async function updateTicketTypeNotesCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: UpdateTicketTypeNotesCoreInput,
): Promise<UpdateTicketTypeNotesCoreResult> {
  const notes = (input.notes ?? []).slice(0, MAX_NOTES).map((n) => ({
    ticketTypeId: n.ticketTypeId,
    description: normalizeTicketTypeNote(n.description),
  }));

  for (const note of notes) {
    const problem = ticketTypeNoteProblem(note.description);
    if (problem) {
      return {
        status: 400,
        message: ticketTypeNoteProblemMessage(coreT(), problem),
      };
    }
  }

  const { data: event, error: eventError } = await supabase
    .from("event")
    .select("id, ticket_type(id, description)")
    .eq("id", input.eventId)
    .eq("organizer_id", userId)
    .maybeSingle();

  if (eventError || !event) {
    return { status: 404, message: tr("eventNotFoundOrUnauthorized") };
  }

  const current = new Map(
    (event.ticket_type ?? []).map((t) => [t.id, t.description ?? null]),
  );
  for (const note of notes) {
    if (!current.has(note.ticketTypeId)) {
      return { status: 404, message: tr("ticketTypeNotFound") };
    }
  }

  // Only the notes that changed are written.
  const changed = notes.filter(
    (note) => current.get(note.ticketTypeId) !== note.description,
  );
  for (const note of changed) {
    const { error } = await supabase
      .from("ticket_type")
      .update({ description: note.description })
      .eq("id", note.ticketTypeId)
      .eq("event_id", input.eventId);
    if (error) {
      logger.error(`Failed saving a ticket note: ${error.message}`);
      return {
        status: 500,
        message: userFacingError("Save ticket notes", error),
      };
    }
  }

  return { status: 200, message: tr("ticketNotesSaved") };
}
