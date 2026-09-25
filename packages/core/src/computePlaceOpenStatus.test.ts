import { describe, expect, it } from "vitest";
import {
  type PlaceOpeningHourRow,
  computePlaceOpenStatus,
  placeLocalNow,
} from "./computePlaceOpenStatus";

// Opening hours are the place's own wall-clock times: a café in London that
// opens at 09:00 is open at 08:30 UTC in summer (09:30 BST).
const weekdays9to17: PlaceOpeningHourRow[] = [1, 2, 3, 4, 5].map((d) => ({
  day_of_week: d,
  open_time: "09:00",
  close_time: "17:00",
  is_closed: false,
}));

describe("computePlaceOpenStatus on the place's clock", () => {
  // Wednesday 16 September 2026, 08:30 UTC.
  const now = new Date("2026-09-16T08:30:00Z");

  it("reads a London place's hours in BST", () => {
    expect(
      computePlaceOpenStatus(weekdays9to17, null, now, "Europe/London").isOpen,
    ).toBe(true);
  });

  it("reads an Accra place's hours in Accra time (UTC+0)", () => {
    expect(
      computePlaceOpenStatus(weekdays9to17, null, now, "Africa/Accra"),
    ).toEqual({ isOpen: false, label: "Closed · Opens at 9:00 AM" });
  });

  it("uses the place's weekday, not the viewer's", () => {
    // 20:30 UTC on Friday is already Saturday 05:30 in Tokyo.
    const fridayEvening = new Date("2026-09-18T20:30:00Z");
    expect(placeLocalNow(fridayEvening, "Asia/Tokyo")).toEqual({
      dow: 6,
      minutes: 5 * 60 + 30,
    });
    expect(
      computePlaceOpenStatus(weekdays9to17, null, fridayEvening, "Asia/Tokyo")
        .label,
    ).toBe("Closed today");
  });
});
