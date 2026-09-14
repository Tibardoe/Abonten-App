import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { checkInTicketCore } from "./checkInTicketCore";

// checkInTicketCore only touches `ticket` — one read to resolve the ticket
// and authorise the caller, one write to flip the status — so a small stub
// is enough to pin the authorisation rules without a live database. The
// DB-level guarantees (RLS, the status transition itself) stay the
// integration suite's job.

const ORGANIZER = "11111111-1111-1111-1111-111111111111";
const OTHER_ORGANIZER = "22222222-2222-2222-2222-222222222222";
const EVENT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const EVENT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const TICKET_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

type TicketFixture = {
  id: string;
  status: string;
  eventId: string;
  organizerId: string;
};

/** Records the update that checkInTicketCore attempted, if any. */
type Recorder = { updated: Record<string, unknown> | null };

function stubClient(
  ticket: TicketFixture | null,
  recorder: Recorder,
): SupabaseClient<Database> {
  const row = ticket
    ? {
        id: ticket.id,
        status: ticket.status,
        ticket_type: {
          event: { id: ticket.eventId, organizer_id: ticket.organizerId },
        },
      }
    : null;

  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: row, error: null }),
              };
            },
          };
        },
        update(values: Record<string, unknown>) {
          recorder.updated = values;
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  } as unknown as SupabaseClient<Database>;
}

const activeTicket: TicketFixture = {
  id: TICKET_ID,
  status: "active",
  eventId: EVENT_A,
  organizerId: ORGANIZER,
};

describe("checkInTicketCore", () => {
  it("checks in an active ticket for the organizer's own event", async () => {
    const rec: Recorder = { updated: null };
    const result = await checkInTicketCore(
      stubClient(activeTicket, rec),
      ORGANIZER,
      TICKET_ID,
      true,
      EVENT_A,
    );

    expect(result.status).toBe(200);
    expect(rec.updated).toMatchObject({ status: "used" });
  });

  it("refuses a ticket belonging to another organizer", async () => {
    const rec: Recorder = { updated: null };
    const result = await checkInTicketCore(
      stubClient(activeTicket, rec),
      OTHER_ORGANIZER,
      TICKET_ID,
      true,
      EVENT_A,
    );

    expect(result.status).toBe(403);
    expect(rec.updated).toBeNull();
  });

  // Regression: the organizer check alone only proves the ticket belongs to
  // ONE of the caller's events. An organizer running two events on the same
  // night could scan an event-A ticket at event B's door and mark it used —
  // the holder is then turned away at the event they actually paid for.
  it("refuses a ticket for a different event of the same organizer", async () => {
    const rec: Recorder = { updated: null };
    const result = await checkInTicketCore(
      stubClient(activeTicket, rec),
      ORGANIZER,
      TICKET_ID,
      true,
      EVENT_B,
    );

    expect(result.status).toBe(404);
    expect(result.message).toBe("That ticket is for a different event.");
    expect(rec.updated).toBeNull();
  });

  it("stays event-agnostic when no event is supplied", async () => {
    const rec: Recorder = { updated: null };
    const result = await checkInTicketCore(
      stubClient(activeTicket, rec),
      ORGANIZER,
      TICKET_ID,
      true,
    );

    expect(result.status).toBe(200);
    expect(rec.updated).toMatchObject({ status: "used" });
  });

  it("refuses to check in a ticket that is already used", async () => {
    const rec: Recorder = { updated: null };
    const result = await checkInTicketCore(
      stubClient({ ...activeTicket, status: "used" }, rec),
      ORGANIZER,
      TICKET_ID,
      true,
      EVENT_A,
    );

    expect(result.status).toBe(400);
    expect(result.message).toBe("This ticket is already checked in.");
    expect(rec.updated).toBeNull();
  });

  it("refuses to check in a cancelled ticket", async () => {
    const rec: Recorder = { updated: null };
    const result = await checkInTicketCore(
      stubClient({ ...activeTicket, status: "cancelled" }, rec),
      ORGANIZER,
      TICKET_ID,
      true,
      EVENT_A,
    );

    expect(result.status).toBe(400);
    expect(rec.updated).toBeNull();
  });

  it("undoes a check-in on a used ticket", async () => {
    const rec: Recorder = { updated: null };
    const result = await checkInTicketCore(
      stubClient({ ...activeTicket, status: "used" }, rec),
      ORGANIZER,
      TICKET_ID,
      false,
      EVENT_A,
    );

    expect(result.status).toBe(200);
    expect(rec.updated).toMatchObject({ status: "active", used_at: null });
  });

  it("refuses to undo a check-in that never happened", async () => {
    const rec: Recorder = { updated: null };
    const result = await checkInTicketCore(
      stubClient(activeTicket, rec),
      ORGANIZER,
      TICKET_ID,
      false,
      EVENT_A,
    );

    expect(result.status).toBe(400);
    expect(rec.updated).toBeNull();
  });

  it("reports an unknown ticket code as not found", async () => {
    const rec: Recorder = { updated: null };
    const result = await checkInTicketCore(
      stubClient(null, rec),
      ORGANIZER,
      "TKT-NOPE1234",
      true,
      EVENT_A,
    );

    expect(result.status).toBe(404);
    expect(rec.updated).toBeNull();
  });
});
