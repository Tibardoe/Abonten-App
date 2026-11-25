import { describe, expect, it } from "vitest";
import {
  USERNAME_MAX_LENGTH,
  normalizeUsernameInput,
  sameUsername,
  slugForUsername,
  suggestUsernames,
  usernameProblem,
} from "./usernames";

describe("usernameProblem", () => {
  it("accepts what the database accepts", () => {
    expect(usernameProblem("abc")).toBeNull();
    expect(usernameProblem("Night_Collective_2026")).toBeNull();
    expect(usernameProblem("a".repeat(30))).toBeNull();
  });

  it("refuses what the database refuses, with the reason", () => {
    expect(usernameProblem("ab")).toBe("short");
    expect(usernameProblem("a".repeat(31))).toBe("long");
    expect(usernameProblem("john.doe")).toBe("characters");
    expect(usernameProblem("kɔfi")).toBe("characters");
    expect(usernameProblem("Deleted_abc123")).toBe("reserved");
  });
});

describe("normalizeUsernameInput / sameUsername", () => {
  it("drops the @ and spaces people type", () => {
    expect(normalizeUsernameInput("  @@echo_nights ")).toBe("echo_nights");
  });
  it("compares without case, as the unique index does", () => {
    expect(sameUsername("Echo_Nights", "echo_nights")).toBe(true);
    expect(sameUsername("echo", "echo1")).toBe(false);
  });
});

describe("slugForUsername", () => {
  it("turns a name into handle characters", () => {
    expect(slugForUsername("Kɔfi's Bar & Grill")).toBe("kofis_bar_grill");
    expect(slugForUsername("  Café  Ɛkuo  ")).toBe("cafe_ekuo");
    expect(slugForUsername("!!!")).toBe("");
  });
});

describe("suggestUsernames", () => {
  it("offers the typed handle with the city, the country, then endings", () => {
    const out = suggestUsernames({
      typed: "echo_nights",
      name: "Echo Nights",
      city: "Accra",
      country: "GH",
      kind: "team",
    });
    expect(out[0]).toBe("echo_nights_accra");
    expect(out[1]).toBe("echo_nights_gh");
    expect(out).toContain("echo_nights_hq");
    expect(out).toContain("echonights_accra");
  });

  it("never offers the typed handle itself, and every one is well formed", () => {
    const out = suggestUsernames(
      { typed: "Echo_Nights", name: "echo nights", country: "GH" },
      50,
    );
    expect(out.map((s) => s.toLowerCase())).not.toContain("echo_nights");
    for (const s of out) expect(usernameProblem(s)).toBeNull();
    expect(new Set(out).size).toBe(out.length);
  });

  it("fits long handles within the limit", () => {
    const out = suggestUsernames({
      typed: "a_very_long_team_handle_almost_30",
      city: "Sekondi-Takoradi",
      kind: "team",
    });
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) {
      expect(s.length).toBeLessThanOrEqual(USERNAME_MAX_LENGTH);
      expect(s.endsWith("_")).toBe(false);
      expect(s).not.toMatch(/__/);
    }
    expect(out[0]).toMatch(/_sekonditakoradi$/);
  });

  it("gives a person numbers, not business endings", () => {
    const out = suggestUsernames({ typed: "ama", name: "Ama Owusu" });
    expect(out.some((s) => s.endsWith("_hq"))).toBe(false);
    expect(out.some((s) => /^ama_\d+$/.test(s))).toBe(true);
    expect(out.some((s) => s.startsWith("ama_owusu"))).toBe(true);
  });

  it("is stable while the person types the same thing", () => {
    const a = suggestUsernames({ typed: "kwame", country: "GH" });
    const b = suggestUsernames({ typed: "kwame", country: "GH" });
    expect(a).toEqual(b);
  });

  it("builds nothing from a reserved or empty start", () => {
    expect(suggestUsernames({ typed: "deleted_abc" })).toEqual([]);
    expect(suggestUsernames({ typed: "", name: "" })).toEqual([]);
  });

  it("respects the limit", () => {
    expect(
      suggestUsernames({ typed: "echo", name: "Echo", kind: "team" }, 2),
    ).toHaveLength(2);
  });
});
