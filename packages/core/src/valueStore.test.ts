import { describe, expect, it, vi } from "vitest";
import { createValueStore } from "./valueStore";

describe("createValueStore", () => {
  it("holds the value it was given, then the one it was set to", () => {
    const store = createValueStore<string | null>(null);
    expect(store.get()).toBeNull();
    store.set("open");
    expect(store.get()).toBe("open");
  });

  it("tells every listener about a change, once", () => {
    const store = createValueStore(0);
    const first = vi.fn();
    const second = vi.fn();
    store.subscribe(first);
    store.subscribe(second);
    store.set(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("says nothing when the value is the same", () => {
    const store = createValueStore("a");
    const listener = vi.fn();
    store.subscribe(listener);
    store.set("a");
    expect(listener).not.toHaveBeenCalled();
  });

  it("stops telling a listener that has left", () => {
    const store = createValueStore(0);
    const listener = vi.fn();
    const leave = store.subscribe(listener);
    leave();
    store.set(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it("lets a listener leave while a change is being told", () => {
    const store = createValueStore(0);
    const second = vi.fn();
    const leaveFirst = store.subscribe(() => leaveFirst());
    store.subscribe(second);
    store.set(1);
    store.set(2);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("has the new value by the time a listener is told", () => {
    const store = createValueStore(0);
    let seen = -1;
    store.subscribe(() => {
      seen = store.get();
    });
    store.set(7);
    expect(seen).toBe(7);
  });
});
