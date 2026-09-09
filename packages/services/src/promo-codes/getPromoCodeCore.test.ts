import { describe, expect, it } from "vitest";
import { promoExpiryCutoff } from "./getPromoCodeCore";

// getPromoCodeCore itself needs a live Supabase client (rate limiting + the
// promo_code read), so it's an integration concern. This covers the pure
// date rule underneath it, which is where the bug was: a code created with
// the wizard's date picker stores midnight at the START of the chosen day,
// so a strict `expires_at < now()` comparison rejected it for the whole of
// the final day the UI had promised ("until Wed, Sep 30, 2026").

describe("promoExpiryCutoff", () => {
  it("treats the stored expiry day as inclusive", () => {
    // Written by the date picker as midnight starting Sep 30.
    const cutoff = promoExpiryCutoff("2026-09-30T00:00:00");
    expect(cutoff.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("keeps a code alive at every hour of its expiry day", () => {
    const cutoff = promoExpiryCutoff("2026-09-30T00:00:00");
    const duringLastDay = new Date("2026-09-30T23:59:59.000Z");
    expect(cutoff > duringLastDay).toBe(true);
  });

  it("expires the code once the next day begins", () => {
    const cutoff = promoExpiryCutoff("2026-09-30T00:00:00");
    const nextDay = new Date("2026-10-01T00:00:00.000Z");
    expect(cutoff <= nextDay).toBe(true);
  });

  it("reads the offset-less timestamp as UTC, not server-local time", () => {
    // Postgres `timestamp without time zone` comes back without a suffix.
    // Both spellings PostgREST can produce must land on the same instant.
    expect(promoExpiryCutoff("2026-09-30T00:00:00").toISOString()).toBe(
      promoExpiryCutoff("2026-09-30 00:00:00").toISOString(),
    );
  });

  it("still rounds to end-of-day when a time component is present", () => {
    // eventPromoCodeManageCore can write a full ISO string; the "until <date>"
    // copy is the same, so the boundary must be too.
    expect(promoExpiryCutoff("2026-09-30T14:30:00").toISOString()).toBe(
      "2026-10-01T00:00:00.000Z",
    );
  });

  it("crosses a month boundary correctly", () => {
    expect(promoExpiryCutoff("2026-12-31T00:00:00").toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });

  it("falls back to the raw value rather than extending an unparseable one", () => {
    const cutoff = promoExpiryCutoff("not-a-date");
    expect(Number.isNaN(cutoff.getTime())).toBe(true);
  });
});
