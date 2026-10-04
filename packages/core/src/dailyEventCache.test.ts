import type { UserPostType } from "@abonten/types/postsType";
import { describe, expect, it } from "vitest";
import { getFeaturedEvents } from "./dailyEventCache";

const DAY = 86_400_000;

function event(id: string, extra: Partial<UserPostType> = {}): UserPostType {
  return {
    id,
    featured: true,
    capacity: 100,
    attendance_count: 0,
    starts_at: new Date(Date.now() + 2 * DAY).toISOString(),
    ends_at: new Date(Date.now() + 2 * DAY + 3_600_000).toISOString(),
    ...extra,
  } as UserPostType;
}

const ids = (events: UserPostType[]) => events.map((e) => e.id).sort();

describe("getFeaturedEvents", () => {
  it("keeps featured events that are still ahead and can be booked", () => {
    const picked = getFeaturedEvents(
      [event("a"), event("b"), event("plain", { featured: false })],
      "accra",
    );
    expect(ids(picked)).toEqual(["a", "b"]);
  });

  it("leaves out an event whose tickets are gone, as its card says", () => {
    const picked = getFeaturedEvents(
      [
        event("stock-gone", {
          ticket_type: [{ quantity: 0 }, { quantity: 0 }] as never,
        }),
        event("one-tier-left", {
          ticket_type: [{ quantity: 0 }, { quantity: 4 }] as never,
        }),
        event("unlimited", { ticket_type: [{ quantity: null }] as never }),
      ],
      "accra",
    );
    expect(ids(picked)).toEqual(["one-tier-left", "unlimited"]);
  });

  it("leaves out an event full by headcount and one that has begun", () => {
    const picked = getFeaturedEvents(
      [
        event("full", { capacity: 2, attendance_count: 2 }),
        event("begun", {
          starts_at: new Date(Date.now() - 3_600_000).toISOString(),
        }),
        event("ok"),
      ],
      "accra",
    );
    expect(ids(picked)).toEqual(["ok"]);
  });
});
