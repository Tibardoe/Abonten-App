import { describe, expect, it } from "vitest";
import { formatStructured } from "./logger";

describe("formatStructured", () => {
  it("joins string arguments into msg and keeps one object as data", () => {
    const line = JSON.parse(
      formatStructured("warn", ["delivery failed", { id: "n1", tries: 3 }]),
    );
    expect(line.level).toBe("warn");
    expect(line.msg).toBe("delivery failed");
    expect(line.data).toEqual({ id: "n1", tries: 3 });
    expect(typeof line.time).toBe("string");
  });

  it("serialises an Error with its name, message and stack", () => {
    const err = new TypeError("boom");
    const line = JSON.parse(formatStructured("error", ["push", err]));
    expect(line.msg).toBe("push boom");
    expect(line.data.name).toBe("TypeError");
    expect(line.data.message).toBe("boom");
    expect(typeof line.data.stack).toBe("string");
  });

  it("never throws on values JSON cannot serialise", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const line = JSON.parse(formatStructured("info", ["x", circular]));
    expect(line.data).toBe("[unserializable]");
    expect(JSON.parse(formatStructured("info", ["n", BigInt(10)])).data).toBe(
      "10",
    );
  });
});
