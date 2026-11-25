import { describe, expect, it } from "vitest";
import {
  type TeamDeletionBlockers,
  teamDeletionBlockerKey,
} from "./teamDeletionCore";

// The database counts what stops a team from being deleted
// (public.team_deletion_blockers, covered by the integration suite); this
// pins which sentence an Owner reads for each, in order, and that staff are
// not held to the Owners' seven-day rule.

const clear: TeamDeletionBlockers = {
  upcoming_events_with_attendees: 0,
  payouts_in_flight: 0,
  balance_owed: 0,
  seats_held: 0,
  payments_in_progress: 0,
  promotions_running: 0,
  owners_changed_recently: 0,
};

describe("teamDeletionBlockerKey", () => {
  it("lets a team with nothing outstanding go", () => {
    expect(teamDeletionBlockerKey(clear)).toBeNull();
    // Counts come back from Postgres as strings sometimes.
    expect(
      teamDeletionBlockerKey({ ...clear, balance_owed: "0.004" }),
    ).toBeNull();
  });

  it("names each thing to do first", () => {
    const cases: [Partial<TeamDeletionBlockers>, string][] = [
      [{ upcoming_events_with_attendees: 1 }, "teamDeleteBlockedEvents"],
      [{ seats_held: "2" }, "teamDeleteBlockedPlans"],
      [{ payouts_in_flight: 1 }, "teamDeleteBlockedPayout"],
      [{ balance_owed: "25.00" }, "teamDeleteBlockedBalance"],
      [{ payments_in_progress: 1 }, "teamDeleteBlockedPayments"],
      [{ promotions_running: 1 }, "teamDeleteBlockedPromotion"],
      [{ owners_changed_recently: 1 }, "teamDeleteBlockedOwnersChanged"],
    ];
    for (const [counts, key] of cases) {
      expect(teamDeletionBlockerKey({ ...clear, ...counts })).toBe(key);
    }
  });

  it("says what matters most first: attendees before money", () => {
    expect(
      teamDeletionBlockerKey({
        ...clear,
        balance_owed: 10,
        upcoming_events_with_attendees: 3,
        owners_changed_recently: 1,
      }),
    ).toBe("teamDeleteBlockedEvents");
  });

  it("does not hold staff to the Owners' seven-day rule", () => {
    const owners = { ...clear, owners_changed_recently: 2 };
    expect(teamDeletionBlockerKey(owners, { staff: true })).toBeNull();
    expect(
      teamDeletionBlockerKey(
        { ...owners, payouts_in_flight: 1 },
        { staff: true },
      ),
    ).toBe("teamDeleteBlockedPayout");
  });
});
