import type { UserPostType } from "@abonten/types/postsType";
import { describe, expect, it } from "vitest";
import { filterEventsByWindow } from "./eventDateWindow";

function ev(id: string, over: Partial<UserPostType> = {}): UserPostType {
  return {
    id,
    title: id,
    created_at: "2026-09-01T00:00:00Z",
    address: { full_address: "Accra" },
    event_code: id,
    currency: "GHS",
    starts_at: new Date("2026-12-01T18:00:00Z"),
    ...over,
  } as UserPostType;
}

describe("filterEventsByWindow: top-rated-organizers", () => {
  it("orders by the organizer's rating, then by how many people rated them", () => {
    const rows = [
      ev("low", { organizer_avg_rating: 3.2, organizer_rating_count: 40 }),
      ev("best", { organizer_avg_rating: 4.9, organizer_rating_count: 3 }),
      ev("tie-fewer", { organizer_avg_rating: 4.5, organizer_rating_count: 2 }),
      ev("tie-more", { organizer_avg_rating: 4.5, organizer_rating_count: 12 }),
    ];
    expect(
      filterEventsByWindow(rows, "top-rated-organizers").map((r) => r.id),
    ).toEqual(["best", "tie-more", "tie-fewer", "low"]);
  });

  it("drops events whose organizer has no visible reviews", () => {
    const rows = [
      ev("rated", { organizer_avg_rating: 4, organizer_rating_count: 1 }),
      ev("unrated", { organizer_avg_rating: 0, organizer_rating_count: 0 }),
      ev("null-rated", {
        organizer_avg_rating: null,
        organizer_rating_count: null,
      }),
    ];
    expect(
      filterEventsByWindow(rows, "top-rated-organizers").map((r) => r.id),
    ).toEqual(["rated"]);
  });

  it("coerces the numeric strings PostgREST can hand back", () => {
    const rows = [
      ev("a", {
        organizer_avg_rating: "4.10" as unknown as number,
        organizer_rating_count: "5" as unknown as number,
      }),
      ev("b", {
        organizer_avg_rating: "4.70" as unknown as number,
        organizer_rating_count: "1" as unknown as number,
      }),
    ];
    expect(
      filterEventsByWindow(rows, "top-rated-organizers").map((r) => r.id),
    ).toEqual(["b", "a"]);
  });

  it("passes rows through untouched when none of them carry a rating at all", () => {
    // A producer that predates the organizer_* columns (a cached page, an
    // older deploy) must not make the slider vanish.
    const rows = [ev("x"), ev("y")];
    expect(filterEventsByWindow(rows, "top-rated-organizers")).toEqual(rows);
  });

  it("does not mutate the input array", () => {
    const rows = [
      ev("a", { organizer_avg_rating: 3, organizer_rating_count: 1 }),
      ev("b", { organizer_avg_rating: 5, organizer_rating_count: 1 }),
    ];
    const before = rows.map((r) => r.id);
    filterEventsByWindow(rows, "top-rated-organizers");
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});
