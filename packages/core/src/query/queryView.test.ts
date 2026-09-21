import { describe, expect, it } from "vitest";
import { type QueryViewInput, resolveQueryView } from "./queryView";

const base: QueryViewInput = {
  hasData: false,
  isEmpty: false,
  status: "pending",
  fetchStatus: "idle",
  restoring: false,
  online: true,
};

const view = (patch: Partial<QueryViewInput>) =>
  resolveQueryView({ ...base, ...patch });

describe("resolveQueryView", () => {
  it("keeps cached content through a refresh, a failure and being offline", () => {
    expect(
      view({ hasData: true, status: "success", fetchStatus: "fetching" }),
    ).toEqual({ kind: "content", refreshing: true, refreshFailed: false });
    expect(view({ hasData: true, status: "error" })).toEqual({
      kind: "content",
      refreshing: false,
      refreshFailed: true,
    });
    expect(view({ hasData: true, status: "success", online: false }).kind).toBe(
      "content",
    );
  });

  it("shows empty only for data that holds nothing", () => {
    expect(view({ hasData: true, isEmpty: true, status: "success" }).kind).toBe(
      "empty",
    );
    // isEmpty without data is not an answer.
    expect(view({ isEmpty: true, fetchStatus: "paused" }).kind).toBe("offline");
  });

  it("is loading while the cache restores or a request is in flight", () => {
    expect(view({ restoring: true, online: false }).kind).toBe("loading");
    expect(view({ fetchStatus: "fetching" }).kind).toBe("loading");
    expect(view({}).kind).toBe("loading");
  });

  it("separates offline from a failed request", () => {
    // React Query pauses a retry until the network returns.
    expect(view({ fetchStatus: "paused" }).kind).toBe("offline");
    expect(view({ status: "error", online: false }).kind).toBe("offline");
    expect(view({ online: false }).kind).toBe("offline");
    expect(view({ status: "error" }).kind).toBe("error");
  });

  it("calls a failed attempt offline at once instead of waiting on the retry", () => {
    expect(
      view({ fetchStatus: "fetching", online: false, failureCount: 1 }).kind,
    ).toBe("offline");
    // Online, a retry in flight is still loading.
    expect(view({ fetchStatus: "fetching", failureCount: 1 }).kind).toBe(
      "loading",
    );
  });
});
