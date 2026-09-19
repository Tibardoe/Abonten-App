import { describe, expect, it, vi } from "vitest";
import { createLatestIntentToggle } from "./latestIntentToggle";

// A controllable fake server: each send waits until the test resolves it.
function fakeServer() {
  const calls: {
    value: boolean;
    resolve: (n: number) => void;
    reject: () => void;
  }[] = [];
  const send = vi.fn(
    (_key: string, value: boolean) =>
      new Promise<number>((resolve, reject) => {
        calls.push({ value, resolve, reject: () => reject(new Error("x")) });
      }),
  );
  return { send, calls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("createLatestIntentToggle", () => {
  it("keeps one request in flight and sends only the latest intent after it", async () => {
    const server = fakeServer();
    const onSettled = vi.fn();
    const toggle = createLatestIntentToggle({
      send: server.send,
      onSettled,
      onFailed: vi.fn(),
    });

    toggle.set("c1", true, false); // like
    toggle.set("c1", false, false); // unlike
    toggle.set("c1", true, false); // like
    toggle.set("c1", false, false); // unlike
    expect(server.send).toHaveBeenCalledTimes(1);
    expect(server.calls[0].value).toBe(true);

    server.calls[0].resolve(1);
    await flush();
    // Latest intent is "unliked", the server now says liked: one more request.
    expect(server.send).toHaveBeenCalledTimes(2);
    expect(server.calls[1].value).toBe(false);

    server.calls[1].resolve(0);
    await flush();
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith("c1", false, 0);
    expect(toggle.isPending("c1")).toBe(false);
  });

  it("does not send again when the burst ends on the value in flight", async () => {
    const server = fakeServer();
    const onSettled = vi.fn();
    const toggle = createLatestIntentToggle({
      send: server.send,
      onSettled,
      onFailed: vi.fn(),
    });
    toggle.set("c1", true, false);
    toggle.set("c1", false, false);
    toggle.set("c1", true, false);
    server.calls[0].resolve(4);
    await flush();
    expect(server.send).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith("c1", true, 4);
  });

  it("sends nothing for a tap that matches the server", async () => {
    const server = fakeServer();
    const toggle = createLatestIntentToggle({
      send: server.send,
      onSettled: vi.fn(),
      onFailed: vi.fn(),
    });
    toggle.set("c1", true, true);
    await flush();
    expect(server.send).not.toHaveBeenCalled();
    expect(toggle.isPending("c1")).toBe(false);
  });

  it("reports the last confirmed value when a request fails", async () => {
    const server = fakeServer();
    const onFailed = vi.fn();
    const toggle = createLatestIntentToggle({
      send: server.send,
      onSettled: vi.fn(),
      onFailed,
    });
    toggle.set("c1", true, false);
    server.calls[0].reject();
    await flush();
    expect(onFailed).toHaveBeenCalledWith("c1", false);
    expect(toggle.isPending("c1")).toBe(false);
  });

  it("keeps keys independent", async () => {
    const server = fakeServer();
    const toggle = createLatestIntentToggle({
      send: server.send,
      onSettled: vi.fn(),
      onFailed: vi.fn(),
    });
    toggle.set("a", true, false);
    toggle.set("b", true, false);
    expect(server.send).toHaveBeenCalledTimes(2);
  });
});
