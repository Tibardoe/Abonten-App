import { describe, expect, it } from "vitest";
import { PLACE_SETUP_MIN_PHOTOS, computePlaceSetup } from "./placeSetup";

const EMPTY = {
  photoCount: 0,
  hasOpeningHours: false,
  hasContact: false,
  serviceCount: 0,
  verificationStatus: null,
  verificationAvailable: true,
};

describe("computePlaceSetup", () => {
  it("counts nothing done on a bare place", () => {
    const setup = computePlaceSetup(EMPTY);
    expect(setup.completedCount).toBe(0);
    expect(setup.total).toBe(5);
    expect(setup.isComplete).toBe(false);
  });

  it("needs the full photo minimum, not just one photo", () => {
    const nearly = computePlaceSetup({
      ...EMPTY,
      photoCount: PLACE_SETUP_MIN_PHOTOS - 1,
    });
    expect(nearly.items.find((i) => i.key === "photos")?.complete).toBe(false);

    const enough = computePlaceSetup({
      ...EMPTY,
      photoCount: PLACE_SETUP_MIN_PHOTOS,
    });
    expect(enough.items.find((i) => i.key === "photos")?.complete).toBe(true);
  });

  it("counts the place as fully set up only once it is verified", () => {
    const base = {
      ...EMPTY,
      photoCount: 5,
      hasOpeningHours: true,
      hasContact: true,
      serviceCount: 2,
    };
    expect(
      computePlaceSetup({ ...base, verificationStatus: null }).isComplete,
    ).toBe(false);
    expect(
      computePlaceSetup({ ...base, verificationStatus: "pending_review" })
        .isComplete,
    ).toBe(false);
    expect(
      computePlaceSetup({ ...base, verificationStatus: "approved" }).isComplete,
    ).toBe(true);
  });

  it("hides the verification row when the programme is off and nothing exists", () => {
    const setup = computePlaceSetup({
      ...EMPTY,
      verificationAvailable: false,
      verificationStatus: null,
    });
    expect(setup.total).toBe(4);
    expect(setup.items.some((i) => i.key === "verification")).toBe(false);
  });

  it("still shows an existing verification when the programme is off", () => {
    const setup = computePlaceSetup({
      ...EMPTY,
      verificationAvailable: false,
      verificationStatus: "approved",
    });
    expect(setup.total).toBe(5);
    const row = setup.items.find((i) => i.key === "verification");
    expect(row?.complete).toBe(true);
    expect(row?.statusLabel).toBe("approved");
  });

  it("accepts any one contact channel", () => {
    expect(
      computePlaceSetup({ ...EMPTY, hasContact: true }).items.find(
        (i) => i.key === "contact",
      )?.complete,
    ).toBe(true);
  });

  it("points each item at the tab that fixes it", () => {
    const tabs = Object.fromEntries(
      computePlaceSetup(EMPTY).items.map((i) => [i.key, i.tab]),
    );
    expect(tabs).toEqual({
      photos: "photos",
      hours: "hours",
      contact: "details",
      services: "services",
      verification: "verification",
    });
  });
});
