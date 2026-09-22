import { describe, expect, it } from "vitest";
import {
  AREA_MISMATCH_METRES,
  type BrowsingArea,
  type LocationState,
  SIGNIFICANT_MOVE_METRES,
  areaStatus,
  followedAreaAfterFix,
  isSignificantMove,
  parseStoredLocationState,
  shouldSuggestCurrentLocation,
} from "./browsingArea";

// Accra centre, and points a known distance from it.
const ACCRA = { lat: 5.6037, lng: -0.187 };
// ~0.5 km north.
const AROUND_THE_CORNER = { lat: 5.6082, lng: -0.187 };
// ~0.9 km north.
const NEARBY = { lat: 5.6118, lng: -0.187 };
// ~4.5 km north.
const ACROSS_TOWN = { lat: 5.6442, lng: -0.187 };
// Tema, ~25 km east.
const TEMA = { lat: 5.6698, lng: -0.0166 };
// Kumasi, ~200 km away.
const KUMASI = { lat: 6.6885, lng: -1.6244 };
// Tamale, ~400 km away.
const TAMALE = { lat: 9.4034, lng: -0.8424 };

const following = (p = ACCRA, label = "Accra"): BrowsingArea => ({
  ...p,
  label,
  mode: "following",
  isFallback: false,
});
const chosen = (p = ACCRA, label = "Accra"): BrowsingArea => ({
  ...p,
  label,
  mode: "chosen",
  isFallback: false,
});
const fallback: BrowsingArea = {
  ...ACCRA,
  label: "Accra",
  mode: "following",
  isFallback: true,
};

describe("isSignificantMove", () => {
  it("ignores GPS jitter and short moves", () => {
    expect(
      isSignificantMove(ACCRA, { ...ACCRA, lat: ACCRA.lat + 0.0005 }),
    ).toBe(false);
    expect(isSignificantMove(ACCRA, AROUND_THE_CORNER)).toBe(false);
    expect(isSignificantMove(ACCRA, NEARBY)).toBe(false);
  });

  it("counts a move past the threshold", () => {
    expect(isSignificantMove(ACCRA, ACROSS_TOWN)).toBe(true);
    expect(isSignificantMove(ACCRA, KUMASI)).toBe(true);
    expect(SIGNIFICANT_MOVE_METRES).toBe(2000);
  });

  it("treats any real fix as a move away from nothing or from the fallback", () => {
    expect(isSignificantMove(null, ACCRA)).toBe(true);
    expect(isSignificantMove({ ...ACCRA, isFallback: true }, ACCRA)).toBe(true);
  });

  it("does not trust an approximate fix to prove a move within its own accuracy", () => {
    // 4.5 km away but only accurate to 3 km: could be the same place.
    expect(isSignificantMove(ACCRA, { ...ACROSS_TOWN, accuracy: 3000 })).toBe(
      false,
    );
    // The same move with a precise fix counts.
    expect(isSignificantMove(ACCRA, { ...ACROSS_TOWN, accuracy: 20 })).toBe(
      true,
    );
    // A far move counts however rough the fix.
    expect(isSignificantMove(ACCRA, { ...KUMASI, accuracy: 3000 })).toBe(true);
    // Unknown accuracy is treated as precise.
    expect(isSignificantMove(ACCRA, { ...ACROSS_TOWN, accuracy: null })).toBe(
      true,
    );
  });

  it("honours a custom threshold", () => {
    expect(isSignificantMove(ACCRA, NEARBY, 500)).toBe(true);
    expect(isSignificantMove(ACCRA, ACROSS_TOWN, 10_000)).toBe(false);
  });
});

describe("followedAreaAfterFix", () => {
  it("device in Accra → browsing Accra", () => {
    expect(followedAreaAfterFix(null, ACCRA)).toEqual(ACCRA);
    expect(followedAreaAfterFix(fallback, ACCRA)).toEqual(ACCRA);
  });

  it("keeps a following area for a 500 m move and moves it for 3 km+", () => {
    expect(followedAreaAfterFix(following(), AROUND_THE_CORNER)).toBeNull();
    expect(followedAreaAfterFix(following(), ACROSS_TOWN)).toEqual(ACROSS_TOWN);
    expect(followedAreaAfterFix(following(), KUMASI)).toEqual(KUMASI);
  });

  it("never moves a chosen area, however far the phone has gone", () => {
    expect(followedAreaAfterFix(chosen(), KUMASI)).toBeNull();
    expect(followedAreaAfterFix(chosen(), TAMALE)).toBeNull();
  });

  it("returns only coordinates, leaving the label to the caller", () => {
    expect(followedAreaAfterFix(following(), KUMASI)).toEqual({
      lat: KUMASI.lat,
      lng: KUMASI.lng,
    });
  });
});

describe("shouldSuggestCurrentLocation", () => {
  const chosenAccraFromKumasi: LocationState = {
    area: chosen(ACCRA),
    anchor: KUMASI,
  };

  it("never suggests while the area follows the phone", () => {
    expect(
      shouldSuggestCurrentLocation({ area: following(), anchor: null }, KUMASI),
    ).toBe(false);
  });

  it("needs a device position", () => {
    expect(shouldSuggestCurrentLocation(chosenAccraFromKumasi, null)).toBe(
      false,
    );
    expect(shouldSuggestCurrentLocation(null, KUMASI)).toBe(false);
  });

  it("does not nag someone who chose an area from where they still are", () => {
    // Chose Accra while in Kumasi; still in Kumasi.
    expect(shouldSuggestCurrentLocation(chosenAccraFromKumasi, KUMASI)).toBe(
      false,
    );
    // Chose Osu while in Labadi (a few km) and has not moved.
    expect(
      shouldSuggestCurrentLocation(
        { area: chosen(ACCRA, "Osu"), anchor: ACROSS_TOWN },
        ACROSS_TOWN,
      ),
    ).toBe(false);
  });

  it("does not suggest when the phone is at the chosen area anyway", () => {
    // Chose Accra from Kumasi, then arrived in Accra: nothing to switch to.
    expect(shouldSuggestCurrentLocation(chosenAccraFromKumasi, ACCRA)).toBe(
      false,
    );
    expect(
      shouldSuggestCurrentLocation(chosenAccraFromKumasi, ACROSS_TOWN),
    ).toBe(false);
  });

  it("suggests once the phone has moved on to somewhere else", () => {
    // Chose Accra from Kumasi, then travelled to Tamale.
    expect(shouldSuggestCurrentLocation(chosenAccraFromKumasi, TAMALE)).toBe(
      true,
    );
  });

  it("suggests when the position was unknown at the time of the choice and is far now", () => {
    expect(
      shouldSuggestCurrentLocation(
        { area: chosen(ACCRA), anchor: null },
        KUMASI,
      ),
    ).toBe(true);
    expect(
      shouldSuggestCurrentLocation({ area: chosen(ACCRA), anchor: null }, TEMA),
    ).toBe(true);
    expect(
      shouldSuggestCurrentLocation(
        { area: chosen(ACCRA), anchor: null },
        ACROSS_TOWN,
      ),
    ).toBe(false);
  });

  it("stays quiet after a dismissal until the phone moves on again", () => {
    // Suggested in Tamale and dismissed there: the anchor is now Tamale.
    const dismissed: LocationState = { area: chosen(ACCRA), anchor: TAMALE };
    expect(shouldSuggestCurrentLocation(dismissed, TAMALE)).toBe(false);
    expect(
      shouldSuggestCurrentLocation(dismissed, {
        lat: TAMALE.lat + 0.02,
        lng: TAMALE.lng,
      }),
    ).toBe(false);
    // Back in Kumasi: a new place, a new suggestion.
    expect(shouldSuggestCurrentLocation(dismissed, KUMASI)).toBe(true);
  });

  it("a commuter who chose home is asked once at work, not every day", () => {
    const home = chosen(ACCRA, "East Legon");
    // Day 1: at work in Tema → suggested; dismissed there.
    expect(
      shouldSuggestCurrentLocation({ area: home, anchor: ACCRA }, TEMA),
    ).toBe(true);
    const afterDismiss: LocationState = { area: home, anchor: TEMA };
    // Back home: nothing (at the area).
    expect(shouldSuggestCurrentLocation(afterDismiss, ACCRA)).toBe(false);
    // Day 2 at work: nothing (dismissed here).
    expect(shouldSuggestCurrentLocation(afterDismiss, TEMA)).toBe(false);
    expect(AREA_MISMATCH_METRES).toBe(10_000);
  });
});

describe("areaStatus", () => {
  it("describes a following area by whether the phone can be read", () => {
    expect(areaStatus(following(), "granted")).toBe("near_you");
    expect(areaStatus(following(), "denied")).toBe("location_off");
    expect(areaStatus(following(), "blocked")).toBe("location_off");
    expect(areaStatus(following(), "off")).toBe("location_off");
    expect(areaStatus(fallback, "granted")).toBe("locating");
    expect(areaStatus(fallback, "unknown")).toBe("locating");
    expect(areaStatus(fallback, "denied")).toBe("location_off");
    expect(areaStatus(null, "unknown")).toBe("locating");
  });

  it("a chosen area is chosen whatever the permission", () => {
    expect(areaStatus(chosen(), "granted")).toBe("chosen");
    expect(areaStatus(chosen(), "denied")).toBe("chosen");
  });
});

describe("parseStoredLocationState", () => {
  it("accepts the current record shape", () => {
    expect(
      parseStoredLocationState({
        area: { lat: 5.6, lng: -0.2, label: "Accra", mode: "chosen" },
        anchor: { lat: 6.7, lng: -1.6 },
      }),
    ).toEqual({
      area: {
        lat: 5.6,
        lng: -0.2,
        label: "Accra",
        mode: "chosen",
        isFallback: false,
      },
      anchor: { lat: 6.7, lng: -1.6 },
    });
    expect(
      parseStoredLocationState({
        area: { lat: 5.6, lng: -0.2, label: "Accra", mode: "following" },
        anchor: null,
      }),
    ).toEqual({
      area: {
        lat: 5.6,
        lng: -0.2,
        label: "Accra",
        mode: "following",
        isFallback: false,
      },
      anchor: null,
    });
  });

  it("migrates the previous flat record (source device | manual)", () => {
    expect(
      parseStoredLocationState({
        lat: 5.6,
        lng: -0.2,
        label: "Accra",
        isFallback: false,
        source: "manual",
      }),
    ).toEqual({
      area: {
        lat: 5.6,
        lng: -0.2,
        label: "Accra",
        mode: "chosen",
        isFallback: false,
      },
      anchor: null,
    });
    expect(
      parseStoredLocationState({
        lat: 5.6,
        lng: -0.2,
        label: "Accra",
        source: "device",
      })?.area.mode,
    ).toBe("following");
  });

  it("never reads a stored record back as the fallback", () => {
    expect(
      parseStoredLocationState({
        area: {
          lat: 5.6,
          lng: -0.2,
          label: "Accra",
          mode: "following",
          isFallback: true,
        },
      })?.area.isFallback,
    ).toBe(false);
  });

  it("drops records without an owner, so an old 'use my location' is not frozen", () => {
    expect(
      parseStoredLocationState({ lat: 5.6, lng: -0.2, label: "Accra" }),
    ).toBeNull();
  });

  it("drops malformed or out-of-range coordinates and a bad anchor", () => {
    expect(parseStoredLocationState(null)).toBeNull();
    expect(parseStoredLocationState("x")).toBeNull();
    expect(
      parseStoredLocationState({
        area: { lat: "5", lng: -0.2, label: "A", mode: "chosen" },
      }),
    ).toBeNull();
    expect(
      parseStoredLocationState({
        area: { lat: Number.NaN, lng: -0.2, label: "A", mode: "chosen" },
      }),
    ).toBeNull();
    expect(
      parseStoredLocationState({
        area: { lat: 95, lng: -0.2, label: "A", mode: "chosen" },
      }),
    ).toBeNull();
    expect(
      parseStoredLocationState({
        area: { lat: 5, lng: -0.2, label: "", mode: "chosen" },
      }),
    ).toBeNull();
    expect(
      parseStoredLocationState({
        area: { lat: 5, lng: -0.2, label: "A", mode: "chosen" },
        anchor: { lat: "x", lng: 1 },
      }),
    ).toEqual({
      area: {
        lat: 5,
        lng: -0.2,
        label: "A",
        mode: "chosen",
        isFallback: false,
      },
      anchor: null,
    });
  });
});
