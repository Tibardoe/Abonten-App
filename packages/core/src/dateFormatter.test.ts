import { describe, expect, it } from "vitest";
import { getRelativeTime } from "./dateFormatter";

describe("getRelativeTime", () => {
  const now = new Date("2026-09-18T13:00:00.000Z");

  it("describes a past moment", () => {
    expect(getRelativeTime("2026-09-18T12:55:00.000Z", now)).toBe(
      "5 minutes ago",
    );
    expect(getRelativeTime("2026-09-18T10:00:00.000Z", now)).toBe(
      "3 hours ago",
    );
  });

  it("never reads as the future when the device clock is behind the server", () => {
    // A message the server stamped 20 seconds "after" the device's now.
    expect(getRelativeTime("2026-09-18T13:00:20.000Z", now)).toBe(
      "less than a minute ago",
    );
    expect(getRelativeTime("2026-09-18T13:03:00.000Z", now)).not.toMatch(
      /^in /,
    );
  });
});
