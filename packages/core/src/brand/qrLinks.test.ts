import { describe, expect, it } from "vitest";
import { QR_LINKS, qrLinkDestination, qrLinkUrl } from "./qrLinks";

describe("QR short links", () => {
  it("sends every printed code to a site path", () => {
    for (const { destination } of Object.values(QR_LINKS)) {
      expect(destination.startsWith("/")).toBe(true);
      expect(destination.startsWith("//")).toBe(false);
    }
  });

  it("keeps the codes already printed on artwork", () => {
    // Removing one of these strands every piece that carries it.
    expect(Object.keys(QR_LINKS).sort()).toEqual(
      [
        "akwaaba",
        "discover",
        "organizers",
        "owner",
        "places",
        "tickets",
      ].sort(),
    );
  });

  it("resolves a code whatever its case or spacing", () => {
    expect(qrLinkDestination("organizers")).toBe(
      "/help/organizers/creating-and-publishing-events",
    );
    expect(qrLinkDestination(" Places ")).toBe(
      "/help/place-owners/managing-your-place",
    );
  });

  it("sends an unknown or inherited-property code home", () => {
    expect(qrLinkDestination("retired-campaign")).toBe("/");
    expect(qrLinkDestination("constructor")).toBe("/");
    expect(qrLinkDestination("")).toBe("/");
  });

  it("builds the absolute URL that goes in the code", () => {
    expect(qrLinkUrl("discover")).toBe("https://abontenhub.com/go/discover");
    expect(qrLinkUrl("owner", "http://localhost:3000/")).toBe(
      "http://localhost:3000/go/owner",
    );
  });
});
