import { describe, expect, it } from "vitest";
import { DELETED_ACCOUNT_STATUS, placeHasOwner } from "./placeOwner";

describe("placeHasOwner", () => {
  it("has an owner while the owner's account is not deleted", () => {
    expect(placeHasOwner({ status_id: 1 })).toBe(true);
    // Suspended or banned owners still own the place.
    expect(placeHasOwner({ status_id: 2 })).toBe(true);
    expect(placeHasOwner({ status_id: 3 })).toBe(true);
  });

  it("has nobody behind it once the owner's account is deleted", () => {
    expect(placeHasOwner({ status_id: DELETED_ACCOUNT_STATUS })).toBe(false);
  });

  it("counts an owner the read did not include as present", () => {
    expect(placeHasOwner(undefined)).toBe(true);
    expect(placeHasOwner(null)).toBe(true);
    expect(placeHasOwner({})).toBe(true);
  });
});
