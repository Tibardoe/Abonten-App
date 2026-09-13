import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { mapWeeklyDocument } from "./weeklyDocument";
import {
  WEEKLY_PREVIEW_TTL_MS,
  createWeeklyPreviewToken,
  readWeeklyPreviewToken,
} from "./weeklyPreview";
import { isWeeklyKillSwitchOn, weeklyAudienceIncludes } from "./weeklyProgram";

const KEY = createHash("sha256").update("test-key").digest();
const OTHER_KEY = createHash("sha256").update("other-key").digest();
const EDITION = "3b0f5c1e-8a4f-4d2e-9c7b-1a2b3c4d5e6f";

describe("weekly preview tokens", () => {
  it("round-trips an edition id", () => {
    const now = 1_760_000_000_000;
    const token = createWeeklyPreviewToken(EDITION, now, KEY);
    expect(readWeeklyPreviewToken(token, now + 1_000, KEY)).toBe(EDITION);
  });

  it("expires after the preview window", () => {
    const now = 1_760_000_000_000;
    const token = createWeeklyPreviewToken(EDITION, now, KEY);
    expect(
      readWeeklyPreviewToken(token, now + WEEKLY_PREVIEW_TTL_MS + 1, KEY),
    ).toBeNull();
  });

  it("refuses a tampered id, expiry or signature, and another key", () => {
    const now = 1_760_000_000_000;
    const token = createWeeklyPreviewToken(EDITION, now, KEY);
    const [id, exp, sig] = token.split(".");
    const otherId = "4c1f6d2e-8a4f-4d2e-9c7b-1a2b3c4d5e6f";
    expect(
      readWeeklyPreviewToken(`${otherId}.${exp}.${sig}`, now, KEY),
    ).toBeNull();
    expect(
      readWeeklyPreviewToken(`${id}.${Number(exp) + 60_000}.${sig}`, now, KEY),
    ).toBeNull();
    expect(readWeeklyPreviewToken(`${id}.${exp}.${sig}x`, now, KEY)).toBeNull();
    expect(readWeeklyPreviewToken(token, now, OTHER_KEY)).toBeNull();
  });

  it("refuses malformed input", () => {
    for (const bad of [
      null,
      "",
      "a.b",
      "not-a-uuid.123.sig",
      "x".repeat(300),
    ]) {
      expect(readWeeklyPreviewToken(bad, Date.now(), KEY)).toBeNull();
    }
  });
});

describe("weekly audience", () => {
  const staff = new Set(["staff-1"]);
  const check = async (id: string) => staff.has(id);

  it("opens to everyone, including signed-out visitors, only for 'all'", async () => {
    expect(await weeklyAudienceIncludes("all", [], null, check)).toBe(true);
    expect(await weeklyAudienceIncludes("beta", [], null, check)).toBe(false);
    expect(await weeklyAudienceIncludes("staff", [], null, check)).toBe(false);
  });

  it("includes beta ids and staff for 'beta', staff only for 'staff'", async () => {
    expect(await weeklyAudienceIncludes("beta", ["b-1"], "b-1", check)).toBe(
      true,
    );
    expect(
      await weeklyAudienceIncludes("beta", ["b-1"], "staff-1", check),
    ).toBe(true);
    expect(await weeklyAudienceIncludes("beta", ["b-1"], "u-1", check)).toBe(
      false,
    );
    expect(await weeklyAudienceIncludes("staff", ["b-1"], "b-1", check)).toBe(
      false,
    );
    expect(await weeklyAudienceIncludes("staff", [], "staff-1", check)).toBe(
      true,
    );
  });

  describe("kill switch", () => {
    afterEach(() => {
      Reflect.deleteProperty(process.env, "WEEKLY_KILL_SWITCH");
    });

    it("is on only for the exact value true", () => {
      expect(isWeeklyKillSwitchOn()).toBe(false);
      process.env.WEEKLY_KILL_SWITCH = "1";
      expect(isWeeklyKillSwitchOn()).toBe(false);
      process.env.WEEKLY_KILL_SWITCH = "true";
      expect(isWeeklyKillSwitchOn()).toBe(true);
    });
  });
});

describe("mapWeeklyDocument", () => {
  const doc = {
    edition: {
      id: EDITION,
      scopeSlug: "accra",
      scopeName: "Accra",
      scopeIsNational: false,
      weekStart: "2026-09-14",
      weekEnd: "2026-09-20",
      title: "This week in Accra",
      subtitle: null,
      intro: "Hello",
      publishedAt: "2026-09-14T06:00:00Z",
      weekIsOver: false,
    },
    sections: [
      {
        id: "s1",
        position: 0,
        kind: "curated",
        subjectScope: "mixed",
        layout: "carousel",
        title: "Picks",
        subtitle: null,
        iconKey: "star",
        body: null,
        items: [
          {
            id: "i1",
            position: 0,
            subjectType: "event",
            subjectId: "e1",
            headline: "Do not miss",
            blurb: null,
            event: {
              id: "e1",
              title: "Concert",
              event_code: "ABC123",
              address: { full_address: "Accra" },
              attendance_count: 12,
              min_price: "50.00",
              currency: "GHS",
              ticket_types: [{ price: 50, currency: "GHS", quantity: 3 }],
              flyer_public_id: "flyers/x",
              flyer_version: "1",
            },
            place: null,
          },
          {
            id: "i2",
            position: 1,
            subjectType: "place",
            subjectId: "p1",
            headline: null,
            blurb: null,
            event: null,
            place: {
              id: "p1",
              name: "Chop bar",
              slug: "chop-bar",
              avg_rating: 4.5,
              review_count: 8,
              is_open: true,
              verified: true,
            },
          },
          { id: "i3", position: 2, subjectType: "organizer", subjectId: "u1" },
        ],
      },
    ],
    requestedScope: "accra",
    isFallbackScope: false,
    isPreviousWeek: false,
    isCurrent: true,
  };

  it("maps events and places into the card row shapes", () => {
    const mapped = mapWeeklyDocument(doc);
    expect(mapped?.edition.title).toBe("This week in Accra");
    const [event, place] = mapped?.sections[0].items ?? [];
    expect(event.event?.attendanceCount).toBe(12);
    expect(event.event?.min_price).toBe(50);
    expect(event.event?.ticket_type?.[0].quantity).toBe(3);
    expect(place.place?.slug).toBe("chop-bar");
    expect(place.place?.distance_km).toBeNull();
    expect(place.place?.verified).toBe(true);
  });

  it("drops item types clients cannot render yet", () => {
    expect(mapWeeklyDocument(doc)?.sections[0].items).toHaveLength(2);
  });

  it("returns null for anything that is not a document", () => {
    expect(mapWeeklyDocument(null)).toBeNull();
    expect(mapWeeklyDocument({ sections: [] })).toBeNull();
  });
});
