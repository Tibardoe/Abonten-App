import { describe, expect, it } from "vitest";
import { resolveEventCta } from "./eventCta";

const open = {
  canceled: false,
  ended: false,
  inProgressNoFuture: false,
  soldOut: false,
  ticketTypeCount: 2,
  isFree: false,
  attending: false,
};

describe("resolveEventCta", () => {
  it("offers buy or reserve while tickets are on sale", () => {
    expect(resolveEventCta(open).kind).toBe("buy");
    expect(resolveEventCta({ ...open, isFree: true })).toEqual({
      kind: "rsvp",
      label: "Reserve spot",
      actionable: true,
    });
  });

  it("keeps a held ticket reachable, even after sales close", () => {
    expect(resolveEventCta({ ...open, attending: true }).kind).toBe("going");
    expect(
      resolveEventCta({ ...open, attending: true, ended: true }).kind,
    ).toBe("going");
    // Canceled wins: there is nothing to attend.
    expect(
      resolveEventCta({ ...open, attending: true, canceled: true }).kind,
    ).toBe("canceled");
  });

  it("shows why nothing can be bought, in priority order", () => {
    expect(resolveEventCta({ ...open, ended: true, soldOut: true }).kind).toBe(
      "ended",
    );
    expect(resolveEventCta({ ...open, inProgressNoFuture: true }).kind).toBe(
      "in_progress",
    );
    expect(resolveEventCta({ ...open, soldOut: true })).toMatchObject({
      kind: "sold_out",
      actionable: false,
    });
    expect(resolveEventCta({ ...open, ticketTypeCount: 0 }).kind).toBe(
      "no_tickets",
    );
  });
});
