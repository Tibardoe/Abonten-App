import { describe, expect, it } from "vitest";
import {
  type FollowedLocation,
  SIGNIFICANT_MOVE_METRES,
  deviceMayUpdate,
  isSignificantMove,
  nextFollowedLocation,
  parseStoredLocation,
} from "./followDevice";

// Accra centre, and points a known distance from it.
const ACCRA = { lat: 5.6037, lng: -0.187 };
// ~0.9 km north.
const NEARBY = { lat: 5.6118, lng: -0.187 };
// ~4.5 km north.
const FAR = { lat: 5.6442, lng: -0.187 };
// Kumasi, ~200 km away.
const KUMASI = { lat: 6.6885, lng: -1.6244 };

const device = (p = ACCRA): FollowedLocation => ({
  ...p,
  label: "Accra",
  isFallback: false,
  source: "device",
});
const manual = (p = ACCRA): FollowedLocation => ({
  ...p,
  label: "Accra",
  isFallback: false,
  source: "manual",
});

describe("isSignificantMove", () => {
  it("ignores GPS jitter and short moves", () => {
    expect(
      isSignificantMove(ACCRA, { ...ACCRA, lat: ACCRA.lat + 0.0005 }),
    ).toBe(false);
    expect(isSignificantMove(ACCRA, NEARBY)).toBe(false);
  });

  it("counts a move past the threshold", () => {
    expect(isSignificantMove(ACCRA, FAR)).toBe(true);
    expect(isSignificantMove(ACCRA, KUMASI)).toBe(true);
  });

  it("treats any real fix as a move away from nothing or from the fallback", () => {
    expect(isSignificantMove(null, ACCRA)).toBe(true);
    expect(isSignificantMove({ ...ACCRA, isFallback: true }, ACCRA)).toBe(true);
  });

  it("honours a custom threshold", () => {
    expect(isSignificantMove(ACCRA, NEARBY, 500)).toBe(true);
    expect(isSignificantMove(ACCRA, FAR, 10_000)).toBe(false);
    expect(SIGNIFICANT_MOVE_METRES).toBe(2000);
  });
});

describe("deviceMayUpdate", () => {
  it("lets the device own an unset or device-sourced location only", () => {
    expect(deviceMayUpdate(null)).toBe(true);
    expect(deviceMayUpdate(device())).toBe(true);
    expect(deviceMayUpdate(manual())).toBe(false);
  });
});

describe("nextFollowedLocation", () => {
  it("never overrides a manual choice, however far the phone has gone", () => {
    expect(nextFollowedLocation(manual(), KUMASI)).toBeNull();
  });

  it("moves a device-owned location only on a significant move", () => {
    expect(nextFollowedLocation(device(), NEARBY)).toBeNull();
    expect(nextFollowedLocation(device(), FAR)).toEqual(FAR);
    expect(nextFollowedLocation(device(), KUMASI)).toEqual(KUMASI);
  });

  it("adopts the first real fix", () => {
    expect(nextFollowedLocation(null, ACCRA)).toEqual(ACCRA);
    expect(
      nextFollowedLocation(
        { ...ACCRA, label: "Accra", isFallback: true, source: "device" },
        ACCRA,
      ),
    ).toEqual(ACCRA);
  });

  it("returns only coordinates, leaving the label to the caller", () => {
    const next = nextFollowedLocation(device(), KUMASI);
    expect(next).toEqual({ lat: KUMASI.lat, lng: KUMASI.lng });
  });
});

describe("parseStoredLocation", () => {
  it("accepts a well-formed record", () => {
    expect(
      parseStoredLocation({
        lat: 5.6,
        lng: -0.2,
        label: "Accra",
        isFallback: false,
        source: "manual",
      }),
    ).toEqual({
      lat: 5.6,
      lng: -0.2,
      label: "Accra",
      isFallback: false,
      source: "manual",
    });
  });

  it("drops records without a source, so an old 'use my location' is not frozen", () => {
    expect(
      parseStoredLocation({ lat: 5.6, lng: -0.2, label: "Accra" }),
    ).toBeNull();
  });

  it("drops malformed or out-of-range coordinates", () => {
    expect(parseStoredLocation(null)).toBeNull();
    expect(parseStoredLocation("x")).toBeNull();
    expect(
      parseStoredLocation({
        lat: "5",
        lng: -0.2,
        label: "A",
        source: "device",
      }),
    ).toBeNull();
    expect(
      parseStoredLocation({
        lat: Number.NaN,
        lng: -0.2,
        label: "A",
        source: "device",
      }),
    ).toBeNull();
    expect(
      parseStoredLocation({ lat: 95, lng: -0.2, label: "A", source: "device" }),
    ).toBeNull();
    expect(
      parseStoredLocation({ lat: 5, lng: -0.2, label: "", source: "device" }),
    ).toBeNull();
  });
});
