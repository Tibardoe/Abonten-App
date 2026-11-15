import { describe, expect, it } from "vitest";
import { ticketSendBlockMessageKey } from "./sendBlock";

describe("ticketSendBlockMessageKey", () => {
  it("explains the blocks a holder can still see the ticket under", () => {
    expect(ticketSendBlockMessageKey("organizer_off")).toBe(
      "sendBlockedOrganizerOff",
    );
    expect(ticketSendBlockMessageKey("too_many_moves")).toBe(
      "sendBlockedTooManyMoves",
    );
    expect(ticketSendBlockMessageKey("restricted")).toBe(
      "sendBlockedRestricted",
    );
  });

  it("says nothing where the send control is not shown at all", () => {
    expect(ticketSendBlockMessageKey("program_off")).toBeNull();
    expect(ticketSendBlockMessageKey("not_active")).toBeNull();
    expect(ticketSendBlockMessageKey("event_over")).toBeNull();
    expect(ticketSendBlockMessageKey(null)).toBeNull();
  });
});
