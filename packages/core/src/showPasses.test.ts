import { describe, expect, it } from "vitest";
import {
  passChoicesLeft,
  passSetupProblem,
  passShowChoosable,
  passStateFromRow,
} from "./showPasses";

const row = {
  pass_ticket_id: "p1",
  pass_status: "active",
  name: "Festival pass",
  shows_total: 3,
  shows_used: 2,
  bought_event_id: "e1",
  shows: [
    {
      event_id: "e1",
      event_code: "A",
      starts_at: "2026-12-01T18:00:00Z",
      ends_at: null,
      timezone: "Africa/Accra",
      status: "published",
      is_bought_show: true,
      ticket_id: "p1",
      ticket_status: "active",
      has_pass: true,
      passes_left: 4,
      started: false,
    },
    {
      event_id: "e2",
      event_code: "B",
      starts_at: "2026-12-02T18:00:00Z",
      ends_at: "2026-12-02T20:00:00Z",
      timezone: "Africa/Accra",
      status: "published",
      is_bought_show: false,
      ticket_id: null,
      ticket_status: null,
      has_pass: true,
      passes_left: null,
      started: false,
    },
    {
      event_id: "e3",
      event_code: "C",
      starts_at: "2026-12-03T18:00:00Z",
      ends_at: null,
      timezone: "Africa/Accra",
      status: "published",
      is_bought_show: false,
      ticket_id: null,
      ticket_status: null,
      has_pass: true,
      passes_left: 0,
      started: false,
    },
  ],
};

describe("show passes", () => {
  it("reads the database state", () => {
    const state = passStateFromRow(row);
    expect(state?.showsTotal).toBe(3);
    expect(state?.shows[1]).toMatchObject({
      eventId: "e2",
      passesLeft: null,
      endsAt: "2026-12-02T20:00:00Z",
    });
    expect(passStateFromRow(null)).toBeNull();
  });

  it("knows which shows can still be chosen", () => {
    const state = passStateFromRow(row);
    if (!state) throw new Error("state");
    expect(passChoicesLeft(state)).toBe(1);
    const [bought, open, full] = state.shows;
    expect(passShowChoosable(state, bought)).toBe(false);
    expect(passShowChoosable(state, open)).toBe(true);
    expect(passShowChoosable(state, full)).toBe(false);
    expect(passShowChoosable({ ...state, showsUsed: 3 }, open)).toBe(false);
    expect(passShowChoosable({ ...state, passStatus: "cancelled" }, open)).toBe(
      false,
    );
    expect(passShowChoosable(state, { ...open, started: true })).toBe(false);
  });

  it("checks a pass being set up", () => {
    const ok = { name: "Festival pass", shows: 3, price: 500, quantity: null };
    expect(passSetupProblem(ok)).toBeNull();
    expect(passSetupProblem({ ...ok, name: " " })).toBe("name");
    expect(passSetupProblem({ ...ok, name: "free" })).toBe("name");
    expect(passSetupProblem({ ...ok, shows: 1 })).toBe("shows");
    expect(passSetupProblem({ ...ok, shows: 31 })).toBe("shows");
    expect(passSetupProblem({ ...ok, price: 0 })).toBe("price");
    expect(passSetupProblem({ ...ok, quantity: 0 })).toBe("quantity");
    expect(passSetupProblem({ ...ok, quantity: 10 })).toBeNull();
  });
});
