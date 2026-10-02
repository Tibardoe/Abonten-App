import { describe, expect, it } from "vitest";
import { resolveEventCta } from "./eventCta";
import { t } from "./i18n/testTranslator";

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
    expect(resolveEventCta(t, open).kind).toBe("buy");
    expect(resolveEventCta(t, { ...open, isFree: true })).toEqual({
      kind: "rsvp",
      label: "Reserve spot",
      actionable: true,
    });
  });

  it("keeps a held ticket reachable, even after sales close", () => {
    expect(resolveEventCta(t, { ...open, attending: true }).kind).toBe("going");
    expect(
      resolveEventCta(t, { ...open, attending: true, ended: true }).kind,
    ).toBe("going");
    // Canceled wins: there is nothing to attend.
    expect(
      resolveEventCta(t, { ...open, attending: true, canceled: true }).kind,
    ).toBe("canceled");
  });

  it("shows why nothing can be bought, in priority order", () => {
    expect(
      resolveEventCta(t, { ...open, ended: true, soldOut: true }).kind,
    ).toBe("ended");
    expect(resolveEventCta(t, { ...open, inProgressNoFuture: true }).kind).toBe(
      "in_progress",
    );
    expect(resolveEventCta(t, { ...open, soldOut: true })).toMatchObject({
      kind: "sold_out",
      actionable: false,
    });
    expect(resolveEventCta(t, { ...open, ticketTypeCount: 0 }).kind).toBe(
      "no_tickets",
    );
  });
});
