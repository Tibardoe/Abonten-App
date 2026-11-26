import { describe, expect, it } from "vitest";
import {
  DISPUTE_RETRY_DAYS,
  PLACE_CLAIM_GUARD_MESSAGES,
  type PlaceClaimSubject,
  type PlaceClaimViewer,
  disputeRetryAfter,
  placeClaimInvite,
  placeClaimRefusal,
  placeStewardship,
} from "./placeClaimInvite";
import { DELETED_ACCOUNT_STATUS } from "./placeOwner";

const OWNER = "00000000-0000-4000-8000-000000000001";
const TEAM = "00000000-0000-4000-8000-000000000002";
const VIEWER = "00000000-0000-4000-8000-000000000003";
const NOW = new Date("2026-11-26T12:00:00Z");
const DAY = 86_400_000;

/** A place someone runs: claimed or listed by its owner. */
const owned: PlaceClaimSubject = {
  ownerId: OWNER,
  claimed: false,
  owner: { status_id: 1, is_admin: false },
};
/** Put up by an active staff account and never claimed. */
const listedByAbonten: PlaceClaimSubject = {
  ownerId: OWNER,
  claimed: false,
  owner: { status_id: 1, is_admin: true },
};
/** Its owner's account was deleted. */
const ownerDeleted: PlaceClaimSubject = {
  ownerId: OWNER,
  claimed: false,
  owner: { status_id: DELETED_ACCOUNT_STATUS, is_admin: false },
};

const signedOut: PlaceClaimViewer = { signedIn: false };
const visitor = (
  over: Partial<Extract<PlaceClaimViewer, { signedIn: true }>> = {},
): PlaceClaimViewer => ({
  signedIn: true,
  userId: VIEWER,
  teamIds: [],
  claim: { status: "none" },
  ...over,
});

describe("placeStewardship", () => {
  it("reads a deleted owner as nobody behind the place", () => {
    expect(placeStewardship(ownerDeleted)).toBe("owner_deleted");
  });

  it("reads an unclaimed place of an active staff account as Abonten's listing", () => {
    expect(placeStewardship(listedByAbonten)).toBe("listed_by_abonten");
  });

  it("reads a claimed place as its owner's, even when staff own it", () => {
    expect(placeStewardship({ ...listedByAbonten, claimed: true })).toBe(
      "owner",
    );
  });

  it("reads a place listed by an ordinary account as its owner's", () => {
    expect(placeStewardship(owned)).toBe("owner");
  });

  it("never guesses Abonten's listing from an older cached copy", () => {
    expect(
      placeStewardship({ ownerId: OWNER, claimed: undefined, owner: null }),
    ).toBe("owner");
    expect(
      placeStewardship({
        ownerId: OWNER,
        claimed: false,
        owner: { status_id: 1 },
      }),
    ).toBe("owner");
  });

  it("keeps a suspended or banned owner as the owner", () => {
    for (const status_id of [2, 3]) {
      expect(
        placeStewardship({ ...owned, owner: { status_id, is_admin: false } }),
      ).toBe("owner");
    }
  });
});

describe("placeClaimInvite", () => {
  it("tells the owner nothing about claiming", () => {
    for (const place of [owned, listedByAbonten, ownerDeleted]) {
      expect(placeClaimInvite(place, visitor({ userId: OWNER }), NOW)).toEqual({
        kind: "none",
      });
    }
  });

  it("tells a member of the owning team nothing about claiming", () => {
    const teamPlace = { ...owned, ownerId: TEAM };
    expect(
      placeClaimInvite(teamPlace, visitor({ teamIds: [TEAM] }), NOW),
    ).toEqual({ kind: "none" });
  });

  it("shows a waiting request as pending, whoever runs the place", () => {
    for (const place of [owned, listedByAbonten, ownerDeleted]) {
      expect(
        placeClaimInvite(place, visitor({ claim: { status: "pending" } }), NOW),
      ).toEqual({ kind: "pending" });
    }
  });

  it("invites a claim when the owner's account was deleted", () => {
    expect(placeClaimInvite(ownerDeleted, visitor(), NOW)).toEqual({
      kind: "claim",
      reason: "owner_deleted",
    });
  });

  it("invites a claim on a place Abonten listed", () => {
    expect(placeClaimInvite(listedByAbonten, visitor(), NOW)).toEqual({
      kind: "claim",
      reason: "listed_by_abonten",
    });
  });

  it("offers only the dispute on a place someone runs", () => {
    expect(placeClaimInvite(owned, visitor(), NOW)).toEqual({
      kind: "dispute",
      retryAfter: null,
    });
    // Verified or claimed makes no difference.
    expect(
      placeClaimInvite({ ...owned, claimed: true }, visitor(), NOW),
    ).toEqual({ kind: "dispute", retryAfter: null });
  });

  it("shows signed-out visitors the entry, which signs in first", () => {
    expect(placeClaimInvite(owned, signedOut, NOW)).toEqual({
      kind: "dispute",
      retryAfter: null,
    });
    expect(placeClaimInvite(listedByAbonten, signedOut, NOW)).toEqual({
      kind: "claim",
      reason: "listed_by_abonten",
    });
    expect(placeClaimInvite(ownerDeleted, signedOut, NOW)).toEqual({
      kind: "claim",
      reason: "owner_deleted",
    });
  });

  it("waits for the viewer's own request before offering anything", () => {
    for (const place of [owned, listedByAbonten, ownerDeleted]) {
      expect(
        placeClaimInvite(place, visitor({ claim: undefined }), NOW),
      ).toEqual({ kind: "none" });
    }
  });

  it("waits for the viewer's teams before offering the dispute", () => {
    expect(placeClaimInvite(owned, visitor({ teamIds: null }), NOW)).toEqual({
      kind: "none",
    });
    // Nobody is behind the place: no team of the viewer's can own it.
    expect(
      placeClaimInvite(ownerDeleted, visitor({ teamIds: null }), NOW),
    ).toEqual({ kind: "claim", reason: "owner_deleted" });
  });

  it("offers the dispute again to someone whose earlier claim was approved", () => {
    // They held it once; another account runs it now.
    expect(
      placeClaimInvite(
        owned,
        visitor({
          claim: { status: "approved", reviewedAt: "2026-01-01T00:00:00Z" },
        }),
        NOW,
      ),
    ).toEqual({ kind: "dispute", retryAfter: null });
  });

  it("says when a turned-down disputer may ask again", () => {
    const reviewedAt = new Date(NOW.getTime() - 10 * DAY).toISOString();
    const result = placeClaimInvite(
      owned,
      visitor({ claim: { status: "rejected", reviewedAt } }),
      NOW,
    );
    expect(result).toEqual({
      kind: "dispute",
      retryAfter: new Date(
        new Date(reviewedAt).getTime() + DISPUTE_RETRY_DAYS * DAY,
      ),
    });
  });

  it("lets a turned-down claimant claim a place nobody runs at once", () => {
    const reviewedAt = new Date(NOW.getTime() - DAY).toISOString();
    expect(
      placeClaimInvite(
        listedByAbonten,
        visitor({ claim: { status: "rejected", reviewedAt } }),
        NOW,
      ),
    ).toEqual({ kind: "claim", reason: "listed_by_abonten" });
  });
});

describe("disputeRetryAfter", () => {
  it("is null for anything but a turned-down request", () => {
    expect(disputeRetryAfter(undefined, NOW)).toBeNull();
    expect(disputeRetryAfter({ status: "none" }, NOW)).toBeNull();
    expect(disputeRetryAfter({ status: "pending" }, NOW)).toBeNull();
    expect(
      disputeRetryAfter(
        { status: "approved", reviewedAt: NOW.toISOString() },
        NOW,
      ),
    ).toBeNull();
    expect(disputeRetryAfter({ status: "rejected" }, NOW)).toBeNull();
  });

  it("ends the wait DISPUTE_RETRY_DAYS after the decision", () => {
    const inside = new Date(
      NOW.getTime() - (DISPUTE_RETRY_DAYS - 1) * DAY,
    ).toISOString();
    const outside = new Date(
      NOW.getTime() - (DISPUTE_RETRY_DAYS + 1) * DAY,
    ).toISOString();
    expect(
      disputeRetryAfter({ status: "rejected", reviewedAt: inside }, NOW),
    ).toEqual(new Date(NOW.getTime() + DAY));
    expect(
      disputeRetryAfter({ status: "rejected", reviewedAt: outside }, NOW),
    ).toBeNull();
  });

  it("ignores a decision time it cannot read", () => {
    expect(
      disputeRetryAfter({ status: "rejected", reviewedAt: "not a date" }, NOW),
    ).toBeNull();
  });
});

describe("placeClaimRefusal", () => {
  it("reads the one-waiting-request index", () => {
    expect(placeClaimRefusal({ code: "23505", message: "duplicate key" })).toBe(
      "pending",
    );
  });

  it("reads the guard's two refusals", () => {
    expect(
      placeClaimRefusal({
        code: "P0001",
        message: PLACE_CLAIM_GUARD_MESSAGES.runs_place,
      }),
    ).toBe("runs_place");
    expect(
      placeClaimRefusal({
        code: "P0001",
        message: PLACE_CLAIM_GUARD_MESSAGES.dispute_wait,
      }),
    ).toBe("dispute_wait");
  });

  it("leaves every other error alone", () => {
    expect(placeClaimRefusal(null)).toBeNull();
    expect(placeClaimRefusal({ code: "42501", message: "denied" })).toBeNull();
  });
});
