import { describe, expect, it } from "vitest";
import { createRecentCache } from "./recentCache";

function clock(start = 1_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("createRecentCache", () => {
  it("gives back what it was told, until it is old", () => {
    const time = clock();
    const cache = createRecentCache<string>({
      ttlMs: 30_000,
      limit: 10,
      now: time.now,
    });
    cache.set("a", "user-1");
    expect(cache.get("a")).toBe("user-1");
    time.advance(30_000);
    expect(cache.get("a")).toBe("user-1");
    time.advance(1);
    expect(cache.get("a")).toBeUndefined();
    // An old answer is gone, not kept around.
    expect(cache.size).toBe(0);
  });

  it("knows nothing about a key it was never told", () => {
    const cache = createRecentCache<number>({ ttlMs: 1000, limit: 10 });
    expect(cache.get("missing")).toBeUndefined();
  });

  it("drops the oldest when it is full", () => {
    const cache = createRecentCache<number>({ ttlMs: 1000, limit: 3 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.set("d", 4);
    expect(cache.size).toBe(3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("d")).toBe(4);
  });

  it("counts a key told again as new, not as the oldest", () => {
    const cache = createRecentCache<number>({ ttlMs: 1000, limit: 2 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 10);
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(10);
    expect(cache.get("c")).toBe(3);
  });

  it("starts the time again when a key is told again", () => {
    const time = clock();
    const cache = createRecentCache<number>({
      ttlMs: 1000,
      limit: 10,
      now: time.now,
    });
    cache.set("a", 1);
    time.advance(900);
    cache.set("a", 2);
    time.advance(900);
    expect(cache.get("a")).toBe(2);
  });

  it("forgets a key on request", () => {
    const cache = createRecentCache<number>({ ttlMs: 1000, limit: 10 });
    cache.set("a", 1);
    cache.delete("a");
    expect(cache.get("a")).toBeUndefined();
  });

  it("remembers a null answer as an answer", () => {
    const cache = createRecentCache<number | null>({ ttlMs: 1000, limit: 10 });
    cache.set("a", null);
    expect(cache.get("a")).toBeNull();
  });
});
