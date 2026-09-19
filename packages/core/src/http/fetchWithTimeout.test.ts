import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type FetchTimeoutError,
  fetchWithTimeout,
  isFetchTimeoutError,
} from "./fetchWithTimeout";

describe("fetchWithTimeout", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
  });

  it("returns the response when the request finishes in time", async () => {
    globalThis.fetch = vi.fn(async () => new Response("ok", { status: 200 }));
    const res = await fetchWithTimeout("https://example.test/x", {
      timeoutMs: 1000,
    });
    expect(res.status).toBe(200);
  });

  it("rejects with FetchTimeoutError once the deadline passes", async () => {
    globalThis.fetch = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    ) as typeof fetch;

    const pending = fetchWithTimeout("https://example.test/slow?key=secret", {
      timeoutMs: 500,
    });
    const assertion = expect(pending).rejects.toSatisfy((e: unknown) => {
      return (
        isFetchTimeoutError(e) &&
        (e as FetchTimeoutError).timeoutMs === 500 &&
        !(e as Error).message.includes("secret")
      );
    });
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
  });

  it("reports a caller abort as the caller's error, not a timeout", async () => {
    globalThis.fetch = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    ) as typeof fetch;

    const outer = new AbortController();
    const pending = fetchWithTimeout("https://example.test/x", {
      timeoutMs: 10_000,
      signal: outer.signal,
    });
    const assertion = expect(pending).rejects.toSatisfy(
      (e: unknown) => !isFetchTimeoutError(e),
    );
    outer.abort();
    await assertion;
  });

  it("refuses a non-positive deadline", async () => {
    await expect(
      fetchWithTimeout("https://example.test/x", { timeoutMs: 0 }),
    ).rejects.toBeInstanceOf(RangeError);
  });
});

describe("withDeadline", () => {
  it("resolves with the work's value when it finishes first", async () => {
    const { withDeadline } = await import("./fetchWithTimeout");
    await expect(withDeadline(Promise.resolve(7), 1000, "quick")).resolves.toBe(
      7,
    );
  });

  it("rejects with DeadlineError when the work outlives the deadline", async () => {
    vi.useFakeTimers();
    const { DeadlineError, withDeadline } = await import("./fetchWithTimeout");
    const never = new Promise<number>(() => {});
    const pending = withDeadline(never, 200, "email send");
    const assertion = expect(pending).rejects.toBeInstanceOf(DeadlineError);
    await vi.advanceTimersByTimeAsync(200);
    await assertion;
    vi.useRealTimers();
  });
});
