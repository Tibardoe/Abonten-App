import { describe, expect, it } from "vitest";
import { ownersStillToApprove, teamNameConfirmed } from "./teamDeletion";

describe("teamNameConfirmed", () => {
  it("matches the name whatever the case and spacing", () => {
    expect(teamNameConfirmed("echo nights", "Echo Nights")).toBe(true);
    expect(teamNameConfirmed("  Echo   Nights ", "Echo Nights")).toBe(true);
    expect(teamNameConfirmed("Kɔfi Bar", "kɔfi bar")).toBe(true);
  });

  it("refuses anything else", () => {
    expect(teamNameConfirmed("Echo Night", "Echo Nights")).toBe(false);
    expect(teamNameConfirmed("EchoNights", "Echo Nights")).toBe(false);
    expect(teamNameConfirmed("", "")).toBe(false);
    expect(teamNameConfirmed("   ", "  ")).toBe(false);
  });
});

describe("ownersStillToApprove", () => {
  it("counts who is left, never below zero", () => {
    expect(ownersStillToApprove(3, 1)).toBe(2);
    expect(ownersStillToApprove(2, 2)).toBe(0);
    expect(ownersStillToApprove(1, 3)).toBe(0);
  });
});
