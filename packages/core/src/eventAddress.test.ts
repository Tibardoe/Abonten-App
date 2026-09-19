import { describe, expect, it } from "vitest";
import {
  normalizeEventRow,
  readEventAddress,
  readOccurrences,
} from "./eventAddress";

describe("readEventAddress", () => {
  it("reads the stored object shape", () => {
    expect(readEventAddress({ full_address: "Osu, Accra", lat: 1 })).toEqual({
      full_address: "Osu, Accra",
    });
  });

  it("accepts a bare string and falls back to empty for anything else", () => {
    expect(readEventAddress("Kumasi")).toEqual({ full_address: "Kumasi" });
    expect(readEventAddress(null)).toEqual({ full_address: "" });
    expect(readEventAddress(["x"])).toEqual({ full_address: "" });
    expect(readEventAddress({ full_address: 3 })).toEqual({ full_address: "" });
  });
});

describe("normalizeEventRow", () => {
  it("keeps every other field and replaces address", () => {
    const row = { id: "e1", title: "T", address: { full_address: "A" } };
    expect(normalizeEventRow(row)).toEqual({
      id: "e1",
      title: "T",
      address: { full_address: "A" },
    });
  });
});

describe("readOccurrences", () => {
  it("keeps well-formed rows and drops the rest", () => {
    expect(
      readOccurrences([
        {
          id: "o1",
          starts_at: "2026-01-01T10:00:00Z",
          ends_at: "2026-01-01T12:00:00Z",
        },
        { starts_at: 5 },
        null,
      ]),
    ).toEqual([
      {
        id: "o1",
        starts_at: "2026-01-01T10:00:00Z",
        ends_at: "2026-01-01T12:00:00Z",
      },
    ]);
    expect(readOccurrences(null)).toBeUndefined();
  });

  it("normalizeEventRow parses occurrences only when the row carries them", () => {
    const row = {
      address: "A",
      occurrences: [{ starts_at: "s", ends_at: "e" }],
    };
    expect(normalizeEventRow(row).occurrences).toEqual([
      { starts_at: "s", ends_at: "e" },
    ]);
    expect("occurrences" in normalizeEventRow({ address: "A" })).toBe(false);
  });
});
