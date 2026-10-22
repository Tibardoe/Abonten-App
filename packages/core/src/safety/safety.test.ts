import { describe, expect, it } from "vitest";
import {
  parseEmergencyNumbers,
  primaryEmergencyNumber,
} from "./emergencyNumbers";
import { rankSafetyEvents, safetyEventTiming } from "./eventContext";
import {
  deviceSmsUrl,
  isSafetyToken,
  mapsPinUrl,
  safetyInvitePath,
  safetyViewPath,
  telUrl,
} from "./links";
import {
  EXPIRED_ALERT_VISIBLE_MS,
  LOCATION_STALE_MS,
  MESSAGE_MAX_ATTEMPTS,
  bestDelivery,
  clampCheckInMinutes,
  isLocationVisible,
  locationIntervalMs,
  locationState,
  nextAttemptAt,
  sessionEndsAt,
} from "./rules";

const NOW = Date.parse("2026-10-21T22:00:00Z");
const HOUR = 3_600_000;

describe("who may see where the person is", () => {
  const open = {
    status: "alerting" as const,
    alertedAt: "x",
    resolution: null,
    resolvedAt: null,
  };

  it("while a session is open", () => {
    expect(isLocationVisible(open, NOW)).toBe(true);
    expect(
      isLocationVisible({ ...open, status: "active", alertedAt: null }, NOW),
    ).toBe(true);
  });

  it("never once the person said they are safe, a mistake, or stopped sharing", () => {
    for (const resolution of ["safe", "false_alarm", "ended"]) {
      expect(
        isLocationVisible(
          {
            status: "resolved",
            alertedAt: "x",
            resolution,
            resolvedAt: new Date(NOW).toISOString(),
          },
          NOW,
        ),
      ).toBe(false);
    }
  });

  it("for a day after an alert ran out without anyone closing it", () => {
    const expired = {
      status: "expired" as const,
      alertedAt: "x",
      resolution: "expired",
      resolvedAt: new Date(NOW - HOUR).toISOString(),
    };
    expect(isLocationVisible(expired, NOW)).toBe(true);
    expect(isLocationVisible(expired, NOW + EXPIRED_ALERT_VISIBLE_MS)).toBe(
      false,
    );
    // A share that ran out was never an alert: hidden at once.
    expect(
      isLocationVisible(
        { ...expired, alertedAt: null, resolution: "ended" },
        NOW,
      ),
    ).toBe(false);
  });

  it("says live, stale, none or hidden", () => {
    const point = {
      lat: 5.6,
      lng: -0.18,
      accuracyM: 10,
      at: new Date(NOW - 60_000).toISOString(),
    };
    expect(locationState(open, point, NOW)).toBe("live");
    expect(locationState(open, point, NOW + LOCATION_STALE_MS)).toBe("stale");
    expect(locationState(open, null, NOW)).toBe("none");
    expect(
      locationState(
        {
          status: "resolved",
          alertedAt: "x",
          resolution: "safe",
          resolvedAt: "y",
        },
        point,
        NOW,
      ),
    ).toBe("hidden");
  });
});

describe("timing", () => {
  it("sends positions more often during an alert", () => {
    expect(locationIntervalMs("alerting")).toBeLessThan(
      locationIntervalMs("active") as number,
    );
    expect(locationIntervalMs("resolved")).toBeNull();
  });

  it("keeps check-ins between 10 minutes and 12 hours", () => {
    expect(clampCheckInMinutes(3)).toBe(10);
    expect(clampCheckInMinutes(10_000)).toBe(720);
    expect(clampCheckInMinutes(Number.NaN)).toBe(60);
  });

  it("ends alerts, check-ins and shares by themselves", () => {
    expect(
      sessionEndsAt({
        kind: "sos",
        now: NOW,
        alertHours: 24,
        shareMaxHours: 12,
      }).getTime(),
    ).toBe(NOW + 24 * HOUR);
    expect(
      sessionEndsAt({
        kind: "check_in",
        now: NOW,
        alertHours: 24,
        shareMaxHours: 12,
        dueAt: NOW + 2 * HOUR,
      }).getTime(),
    ).toBe(NOW + 26 * HOUR);
    // A share never runs past the maximum, and never for less than 15 minutes.
    expect(
      sessionEndsAt({
        kind: "share",
        now: NOW,
        alertHours: 24,
        shareMaxHours: 12,
        shareEndsAt: NOW + 48 * HOUR,
      }).getTime(),
    ).toBe(NOW + 12 * HOUR);
    expect(
      sessionEndsAt({
        kind: "share",
        now: NOW,
        alertHours: 24,
        shareMaxHours: 12,
        shareEndsAt: NOW - HOUR,
      }).getTime(),
    ).toBe(NOW + 15 * 60_000);
  });

  it("retries a failed text at 1, 2 and 5 minutes, then stops", () => {
    expect(nextAttemptAt(1, NOW)?.getTime()).toBe(NOW + 60_000);
    expect(nextAttemptAt(2, NOW)?.getTime()).toBe(NOW + 120_000);
    expect(nextAttemptAt(3, NOW)?.getTime()).toBe(NOW + 300_000);
    expect(nextAttemptAt(MESSAGE_MAX_ATTEMPTS, NOW)).toBeNull();
  });

  it("words a recipient by the best channel", () => {
    expect(bestDelivery({ sms: "failed", email: "sent", push: "none" })).toBe(
      "sent",
    );
    expect(
      bestDelivery({ sms: "pending", email: "none", push: "failed" }),
    ).toBe("pending");
    expect(bestDelivery({ sms: "none", email: "none", push: "none" })).toBe(
      "none",
    );
  });
});

describe("links", () => {
  it("opens Messages on each platform", () => {
    const body = "SOS: I need help.";
    expect(
      deviceSmsUrl("ios", ["+233 24 111 0001", "+233241110002"], body),
    ).toBe(
      "sms:/open?addresses=+233241110001,+233241110002&body=SOS%3A%20I%20need%20help.",
    );
    expect(
      deviceSmsUrl("android", ["+233241110001", "+233241110002"], body),
    ).toBe("sms:+233241110001;+233241110002?body=SOS%3A%20I%20need%20help.");
  });

  it("pins and dials", () => {
    expect(mapsPinUrl(5.6037123456, -0.1870001)).toBe(
      "https://www.google.com/maps/search/?api=1&query=5.603712,-0.187",
    );
    expect(telUrl("1 1 2")).toBe("tel:112");
    expect(safetyViewPath("a".repeat(22))).toBe(`/sos/${"a".repeat(22)}`);
    expect(safetyInvitePath("b".repeat(22))).toBe(`/trusted/${"b".repeat(22)}`);
  });

  it("accepts only well-formed tokens", () => {
    expect(isSafetyToken(`${"Ab_-".repeat(5)}xy`)).toBe(true);
    expect(isSafetyToken("short")).toBe(false);
    expect(isSafetyToken(`${"a".repeat(21)}/`)).toBe(false);
    expect(isSafetyToken(null)).toBe(false);
  });
});

describe("emergency numbers", () => {
  it("reads what staff entered, drops what is malformed, leads with the all-emergencies number", () => {
    const numbers = parseEmergencyNumbers({
      emergencyNumbers: [
        { service: "police", number: "191" },
        { service: "all", number: " 112 " },
        { service: "all", number: "112" },
        { service: "aliens", number: "999" },
        { service: "fire", number: "call us" },
        "nonsense",
      ],
    });
    expect(numbers).toEqual([
      { service: "all", number: "112" },
      { service: "police", number: "191" },
    ]);
    expect(primaryEmergencyNumber(numbers)?.number).toBe("112");
    expect(parseEmergencyNumbers(null)).toEqual([]);
    expect(primaryEmergencyNumber([])).toBeNull();
  });
});

describe("which event a session is about", () => {
  const at = (h: number) => new Date(NOW + h * HOUR).toISOString();

  it("prefers the event on now, then the next one, then one that just ended", () => {
    const ranked = rankSafetyEvents(
      [
        { id: "ended", startsAt: at(-6), endsAt: at(-2) },
        { id: "later", startsAt: at(3), endsAt: at(6) },
        { id: "now", startsAt: at(-1), endsAt: at(2) },
        { id: "far", startsAt: at(30), endsAt: at(33) },
        { id: "old", startsAt: at(-30), endsAt: at(-20) },
      ],
      NOW,
    );
    expect(ranked.map((e) => [e.id, e.timing])).toEqual([
      ["now", "ongoing"],
      ["later", "upcoming"],
      ["ended", "ended"],
    ]);
  });

  it("reads the dates of a multi-day event", () => {
    const festival = {
      id: "fest",
      startsAt: at(-50),
      endsAt: at(20),
      occurrences: [
        { starts_at: at(-50), ends_at: at(-44) },
        { starts_at: at(-1), ends_at: at(4) },
        { starts_at: at(20), ends_at: at(24) },
      ],
    };
    expect(safetyEventTiming(festival, NOW)?.timing).toBe("ongoing");
  });
});
