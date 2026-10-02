import { describe, expect, it, vi } from "vitest";
import { createSharedFirstAnswer } from "./sharedFirstAnswer";

type Answer = { userId: string | null; unread: number; program: string };

function setup(
  answer: Answer | null | Error = {
    userId: "u1",
    unread: 3,
    program: "on",
  },
) {
  let t = 1_000;
  const ask = vi.fn(async () => {
    if (answer instanceof Error) throw answer;
    return answer;
  });
  const shared = createSharedFirstAnswer<Answer>({
    ask,
    ownerOf: (a) => a.userId,
    freshForMs: 15_000,
    now: () => t,
  });
  return {
    shared,
    ask,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("createSharedFirstAnswer", () => {
  it("answers every asker from one request", async () => {
    const { shared, ask } = setup();
    shared.prime();
    const [unread, program] = await Promise.all([
      shared.take("unread", "u1"),
      shared.take("program"),
    ]);
    expect(unread).toBe(3);
    expect(program).toBe("on");
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("sends the request once however often it is primed", () => {
    const { shared, ask } = setup();
    shared.prime();
    shared.prime();
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("gives each part once: a refetch asks for itself", async () => {
    const { shared } = setup();
    shared.prime();
    expect(await shared.take("unread", "u1")).toBe(3);
    expect(await shared.take("unread", "u1")).toBeUndefined();
  });

  it("never starts the request for an asker", async () => {
    const { shared, ask } = setup();
    expect(await shared.take("unread", "u1")).toBeUndefined();
    expect(ask).not.toHaveBeenCalled();
  });

  it("is only the page-load answer: a late asker asks for itself", async () => {
    const { shared, advance } = setup();
    shared.prime();
    advance(15_000);
    expect(await shared.take("unread", "u1")).toBe(3);
    advance(1);
    expect(await shared.take("program")).toBeUndefined();
  });

  it("does not hand one person's answer to another", async () => {
    const { shared } = setup();
    shared.prime();
    expect(await shared.take("unread", "someone-else")).toBeUndefined();
  });

  it("does not hand a signed-in answer to a signed-out asker, or the reverse", async () => {
    const signedIn = setup();
    signedIn.shared.prime();
    expect(await signedIn.shared.take("program", null)).toBeUndefined();

    const signedOut = setup({ userId: null, unread: 0, program: "off" });
    signedOut.shared.prime();
    expect(await signedOut.shared.take("unread", "u1")).toBeUndefined();
    expect(await signedOut.shared.take("program", null)).toBe("off");
  });

  it("lets every asker ask for itself when the request fails", async () => {
    const failed = setup(new Error("offline"));
    failed.shared.prime();
    expect(await failed.shared.take("unread", "u1")).toBeUndefined();

    const empty = setup(null);
    empty.shared.prime();
    expect(await empty.shared.take("program")).toBeUndefined();
  });

  it("fails every asker at once when the failure is everyone's", async () => {
    const refused = new Error("refused");
    let t = 0;
    const ask = vi.fn(async (): Promise<Answer | null> => {
      throw refused;
    });
    const shared = createSharedFirstAnswer<Answer>({
      ask,
      ownerOf: (a) => a.userId,
      freshForMs: 15_000,
      failsTogether: (error) => error === refused,
      now: () => t,
    });
    shared.prime();
    await expect(shared.take("unread", "u1")).rejects.toBe(refused);
    await expect(shared.take("program")).rejects.toBe(refused);
    // Once per part, and only while it is the page-load answer.
    expect(await shared.take("unread", "u1")).toBeUndefined();
    t = 20_000;
    expect(await shared.take("userId")).toBeUndefined();
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("keeps other failures to itself: each asker asks for itself", async () => {
    const shared = createSharedFirstAnswer<Answer>({
      ask: async () => {
        throw new Error("offline");
      },
      ownerOf: (a) => a.userId,
      freshForMs: 15_000,
      failsTogether: () => false,
    });
    shared.prime();
    expect(await shared.take("unread", "u1")).toBeUndefined();
  });

  it("hands over a part whose value is null or zero", async () => {
    const { shared } = setup({ userId: "u1", unread: 0, program: "" });
    shared.prime();
    expect(await shared.take("unread", "u1")).toBe(0);
    expect(await shared.take("program")).toBe("");
  });
});
