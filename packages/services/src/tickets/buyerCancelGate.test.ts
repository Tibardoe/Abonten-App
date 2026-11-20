import { beforeEach, describe, expect, it, vi } from "vitest";

// The buyer's side of an event's refund policy, read from the database
// shape the gate selects. The rule itself is unit-tested in
// @abonten/core/refundPolicy; this pins that every buyer cancel path gets
// the refusal from the rows: a started show, no refunds, a passed cut-off.

let rows: unknown[] = [];
let passRows: unknown[] = [];
let readError: { message: string } | null = null;

vi.mock("../supabase/serviceClient", () => ({
  getSupabaseServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        in: () => {
          // The tickets, then the shows chosen with a pass among them.
          const result =
            table === "ticket_checkout"
              ? { data: passRows, error: null }
              : { data: readError ? null : rows, error: readError };
          return Object.assign(Promise.resolve(result), {
            neq: async () => result,
          });
        },
      }),
    }),
  }),
}));

const { buyerCancelGate } = await import("./buyerCancelGate");

const NOW = new Date("2026-12-20T12:00:00Z");
const hoursFromNow = (h: number) =>
  new Date(NOW.getTime() + h * 3_600_000).toISOString();

function ticket(input: {
  paid: boolean;
  policy?: string;
  cutoff?: number | null;
  startsAt?: string | null;
  occurrenceId?: string | null;
  occurrences?: { id: string; starts_at: string }[];
}) {
  return {
    id: "t-1",
    occurrence_id: input.occurrenceId ?? null,
    transaction: input.paid ? { amount: 315, credit_amount: 0 } : null,
    ticket_type: {
      event: {
        starts_at:
          input.startsAt === undefined ? hoursFromNow(72) : input.startsAt,
        refund_policy: input.policy ?? "until_start",
        refund_cutoff_hours: input.cutoff ?? null,
        event_occurrence: input.occurrences ?? [],
      },
    },
  };
}

beforeEach(() => {
  rows = [];
  passRows = [];
  readError = null;
});

describe("buyerCancelGate", () => {
  it("lets a paid ticket go before the start by default", async () => {
    rows = [ticket({ paid: true })];
    expect(await buyerCancelGate(["t-1"], NOW)).toBeNull();
  });

  it("refuses a pass once a show chosen with it has started", async () => {
    rows = [ticket({ paid: true })];
    passRows = [
      {
        pass_ticket_id: "t-1",
        event: { starts_at: hoursFromNow(48) },
        ticket: [{ status: "active" }],
      },
    ];
    expect(await buyerCancelGate(["t-1"], NOW)).toBeNull();
    passRows = [
      {
        pass_ticket_id: "t-1",
        event: { starts_at: hoursFromNow(-1) },
        ticket: [{ status: "used" }],
      },
    ];
    expect(await buyerCancelGate(["t-1"], NOW)).toMatchObject({
      status: 409,
      reason: "started",
    });
  });

  it("refuses once the show has started, paid or free", async () => {
    for (const paid of [true, false]) {
      rows = [ticket({ paid, startsAt: hoursFromNow(-1) })];
      expect(await buyerCancelGate(["t-1"], NOW)).toMatchObject({
        status: 409,
        reason: "started",
      });
    }
  });

  it("refuses a paid ticket under no refunds, not a free one", async () => {
    rows = [ticket({ paid: true, policy: "none" })];
    expect(await buyerCancelGate(["t-1"], NOW)).toMatchObject({
      reason: "no_refunds",
    });
    rows = [ticket({ paid: false, policy: "none" })];
    expect(await buyerCancelGate(["t-1"], NOW)).toBeNull();
  });

  it("closes paid refunds at the cut-off", async () => {
    rows = [ticket({ paid: true, policy: "until_cutoff", cutoff: 48 })];
    expect(await buyerCancelGate(["t-1"], NOW)).toBeNull();
    rows = [
      ticket({
        paid: true,
        policy: "until_cutoff",
        cutoff: 168,
      }),
    ];
    expect(await buyerCancelGate(["t-1"], NOW)).toMatchObject({
      reason: "cutoff_passed",
    });
  });

  it("times a multi-date ticket by its own date", async () => {
    rows = [
      ticket({
        paid: true,
        startsAt: null,
        occurrenceId: "late",
        occurrences: [
          { id: "early", starts_at: hoursFromNow(-2) },
          { id: "late", starts_at: hoursFromNow(30) },
        ],
      }),
    ];
    expect(await buyerCancelGate(["t-1"], NOW)).toBeNull();
  });

  it("answers 500 when the tickets can't be read", async () => {
    readError = { message: "boom" };
    expect(await buyerCancelGate(["t-1"], NOW)).toMatchObject({ status: 500 });
  });

  it("asks nothing for no tickets", async () => {
    expect(await buyerCancelGate([], NOW)).toBeNull();
  });
});
