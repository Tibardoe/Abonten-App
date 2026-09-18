import { describe, expect, it } from "vitest";
import {
  type PersistRule,
  type PersistableQuery,
  matchPersistRule,
  selectPersistedQueries,
  trimInfiniteData,
} from "./persistPolicy";

const rules: PersistRule[] = [
  { id: "own-profile", prefix: ["mobile", "profile"], maxEntries: 1 },
  { id: "public-profile", prefix: ["profile", "public"], maxEntries: 2 },
  {
    id: "feed",
    prefix: ["mobile", "content", "feed"],
    maxEntries: 3,
    maxPages: 1,
  },
];

function q(
  queryKey: unknown[],
  dataUpdatedAt: number,
  data: unknown = { ok: true },
  status = "success",
): PersistableQuery {
  return { queryKey, state: { data, dataUpdatedAt, status } };
}

describe("matchPersistRule", () => {
  it("matches by exact prefix, element by element", () => {
    expect(matchPersistRule(["mobile", "profile"], rules)?.id).toBe(
      "own-profile",
    );
    expect(matchPersistRule(["profile", "public", "ama"], rules)?.id).toBe(
      "public-profile",
    );
    expect(matchPersistRule(["mobile", "tickets", "u1"], rules)).toBeNull();
    // A shorter key never matches a longer prefix.
    expect(matchPersistRule(["profile"], rules)).toBeNull();
  });

  it("compares object elements structurally", () => {
    const withObj: PersistRule[] = [
      { id: "x", prefix: ["a", { k: 1 }], maxEntries: 1 },
    ];
    expect(matchPersistRule(["a", { k: 1 }, "z"], withObj)?.id).toBe("x");
    expect(matchPersistRule(["a", { k: 2 }], withObj)).toBeNull();
  });
});

describe("trimInfiniteData", () => {
  it("keeps the first pages and their params", () => {
    const data = { pages: [1, 2, 3], pageParams: [null, "a", "b"] };
    expect(trimInfiniteData(data, 1)).toEqual({
      pages: [1],
      pageParams: [null],
    });
    expect(trimInfiniteData(data, undefined)).toBe(data);
    expect(trimInfiniteData(data, 5)).toBe(data);
  });

  it("leaves non-infinite data alone", () => {
    const data = { id: 1 };
    expect(trimInfiniteData(data, 1)).toBe(data);
  });
});

describe("selectPersistedQueries", () => {
  it("drops queries no rule allows (the allowlist)", () => {
    const out = selectPersistedQueries(
      [q(["mobile", "tickets", "u"], 5), q(["mobile", "profile"], 5)],
      rules,
    );
    expect(out.map((x) => x.queryKey)).toEqual([["mobile", "profile"]]);
  });

  it("drops failed or empty queries", () => {
    const out = selectPersistedQueries(
      [
        q(["mobile", "profile"], 5, { ok: 1 }, "error"),
        {
          queryKey: ["profile", "public", "a"],
          state: { data: undefined, dataUpdatedAt: 5, status: "success" },
        },
      ],
      rules,
    );
    expect(out).toEqual([]);
  });

  it("caps each rule to its newest entries", () => {
    const out = selectPersistedQueries(
      [
        q(["profile", "public", "old"], 1),
        q(["profile", "public", "new"], 3),
        q(["profile", "public", "mid"], 2),
      ],
      rules,
    );
    expect(out.map((x) => x.queryKey[2])).toEqual(["new", "mid"]);
  });

  it("trims infinite queries without mutating the cache object", () => {
    const data = { pages: ["p1", "p2"], pageParams: [null, "c"] };
    const input = q(["mobile", "content", "feed", "u", "for_you"], 1, data);
    const [out] = selectPersistedQueries([input], rules);
    expect(out.state.data).toEqual({ pages: ["p1"], pageParams: [null] });
    expect(input.state.data).toBe(data);
    expect(data.pages).toHaveLength(2);
  });
});
