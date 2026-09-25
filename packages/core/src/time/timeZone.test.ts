import { describe, expect, it } from "vitest";
import {
  instantToWallClock,
  isValidTimeZone,
  parseEventTimestamp,
  sameDayInZone,
  wallClockToInstant,
  zoneAbbreviation,
  zoneOffsetMinutes,
} from "./timeZone";

describe("time zones", () => {
  it("validates IANA names", () => {
    expect(isValidTimeZone("Africa/Accra")).toBe(true);
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });

  it("turns what the organizer typed into the right instant for the event's city", () => {
    // 19:00 in Accra (GMT, no DST) is 19:00Z.
    expect(
      wallClockToInstant("2026-10-10", "19:00", "Africa/Accra")?.toISOString(),
    ).toBe("2026-10-10T19:00:00.000Z");
    // 19:00 in London in October (BST) is 18:00Z …
    expect(
      wallClockToInstant("2026-10-10", "19:00", "Europe/London")?.toISOString(),
    ).toBe("2026-10-10T18:00:00.000Z");
    // … and in December (GMT) is 19:00Z.
    expect(
      wallClockToInstant("2026-12-10", "19:00", "Europe/London")?.toISOString(),
    ).toBe("2026-12-10T19:00:00.000Z");
    // Lagos is WAT (+1) all year.
    expect(
      wallClockToInstant("2026-12-10", "19:00", "Africa/Lagos")?.toISOString(),
    ).toBe("2026-12-10T18:00:00.000Z");
    // New York in July (EDT, −4).
    expect(
      wallClockToInstant(
        "2026-07-04",
        "20:00",
        "America/New_York",
      )?.toISOString(),
    ).toBe("2026-07-05T00:00:00.000Z");
  });

  it("rejects malformed input", () => {
    expect(wallClockToInstant("2026-1-1", "19:00", "Africa/Accra")).toBeNull();
    expect(
      wallClockToInstant("2026-10-10", "25:00", "Africa/Accra"),
    ).toBeNull();
    expect(wallClockToInstant("2026-10-10", "19:00", "Nowhere")).toBeNull();
  });

  it("round-trips instants to wall clock", () => {
    const d = new Date("2026-10-10T18:00:00Z");
    expect(instantToWallClock(d, "Europe/London")).toEqual({
      date: "2026-10-10",
      time: "19:00",
    });
    expect(instantToWallClock(d, "Africa/Accra")).toEqual({
      date: "2026-10-10",
      time: "18:00",
    });
    expect(
      instantToWallClock(new Date("2026-10-10T23:30:00Z"), "Africa/Nairobi"),
    ).toEqual({
      date: "2026-10-11",
      time: "02:30",
    });
    expect(
      instantToWallClock(new Date("2026-01-01T00:00:00Z"), "UTC").time,
    ).toBe("00:00");
  });

  it("accepts both instants and wall-clock timestamps from clients", () => {
    expect(
      parseEventTimestamp(
        "2026-10-10T18:00:00.000Z",
        "Europe/London",
      )?.toISOString(),
    ).toBe("2026-10-10T18:00:00.000Z");
    expect(
      parseEventTimestamp("2026-10-10T19:00", "Europe/London")?.toISOString(),
    ).toBe("2026-10-10T18:00:00.000Z");
    expect(
      parseEventTimestamp("2026-10-10T19:00:00", "Africa/Accra")?.toISOString(),
    ).toBe("2026-10-10T19:00:00.000Z");
    expect(
      parseEventTimestamp(
        "2026-10-10T19:00+01:00",
        "Africa/Accra",
      )?.toISOString(),
    ).toBe("2026-10-10T18:00:00.000Z");
    expect(parseEventTimestamp("nonsense", "Africa/Accra")).toBeNull();
    expect(parseEventTimestamp(null, "Africa/Accra")).toBeNull();
  });

  it("knows offsets, abbreviations and days", () => {
    expect(
      zoneOffsetMinutes(new Date("2026-07-01T12:00:00Z"), "Europe/London"),
    ).toBe(60);
    expect(
      zoneOffsetMinutes(new Date("2026-12-01T12:00:00Z"), "Europe/London"),
    ).toBe(0);
    expect(
      zoneOffsetMinutes(new Date("2026-12-01T12:00:00Z"), "Africa/Lagos"),
    ).toBe(60);
    expect(
      zoneOffsetMinutes(new Date("2026-12-01T12:00:00Z"), "America/New_York"),
    ).toBe(-300);
    expect(
      zoneAbbreviation(new Date("2026-12-01T12:00:00Z"), "Africa/Accra"),
    ).toBe("GMT");
    expect(
      zoneAbbreviation(new Date("2026-07-01T12:00:00Z"), "Europe/London"),
    ).toBe("BST");
    expect(
      sameDayInZone(
        new Date("2026-10-10T23:30:00Z"),
        new Date("2026-10-11T00:30:00Z"),
        "Africa/Nairobi",
      ),
    ).toBe(true);
    expect(
      sameDayInZone(
        new Date("2026-10-10T23:30:00Z"),
        new Date("2026-10-11T00:30:00Z"),
        "UTC",
      ),
    ).toBe(false);
  });
});

describe("wall-clock strings", () => {
  it("keeps what the person typed, whatever the client zone", async () => {
    const { toWallClockString, wallClockString } = await import("./timeZone");
    expect(toWallClockString(new Date(2026, 9, 10, 19, 5))).toBe(
      "2026-10-10T19:05",
    );
    expect(wallClockString("2026-10-10", "19:05")).toBe("2026-10-10T19:05");
    expect(wallClockString("2026-10-10", "25:00")).toBeNull();
    // Round trip through the venue zone.
    expect(
      parseEventTimestamp(
        wallClockString("2026-10-10", "19:00") as string,
        "Europe/London",
      )?.toISOString(),
    ).toBe("2026-10-10T18:00:00.000Z");
  });
});
