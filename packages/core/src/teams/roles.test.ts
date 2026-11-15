import { describe, expect, it } from "vitest";
import {
  TEAM_CAPABILITIES,
  TEAM_ROLES,
  isTeamRole,
  teamRoleCan,
  teamRoleCapabilities,
  teamRoleNeedsIdCheck,
} from "./roles";

describe("team roles", () => {
  it("matches the plan's role table (and public.team_role_can)", () => {
    expect(teamRoleCapabilities("owner")).toEqual([...TEAM_CAPABILITIES]);
    expect(teamRoleCapabilities("finance")).toEqual([
      "payout.view",
      "payout.request",
      "money.view",
      "refunds.issue",
    ]);
    expect(teamRoleCapabilities("manager")).toEqual([
      "events.manage",
      "places.manage",
      "promo.manage",
      "bookings.manage",
      "attendees.view",
      "checkin.scan",
    ]);
    expect(teamRoleCapabilities("content")).toEqual([
      "messages.reply",
      "content.post",
      "reviews.reply",
    ]);
    expect(teamRoleCapabilities("door")).toEqual(["checkin.scan"]);
    expect(teamRoleCapabilities("front_desk")).toEqual([
      "bookings.manage",
      "visit.show",
    ]);
  });

  it("keeps money and members with the roles meant to hold them", () => {
    for (const role of TEAM_ROLES) {
      expect(teamRoleCan(role, "payout.manage")).toBe(role === "owner");
      expect(teamRoleCan(role, "team.members")).toBe(role === "owner");
      expect(teamRoleCan(role, "money.view")).toBe(
        role === "owner" || role === "finance",
      );
    }
    // Door staff see scan results, never the attendee list.
    expect(teamRoleCan("door", "attendees.view")).toBe(false);
  });

  it("asks for the ID check only of roles that move money (X5)", () => {
    expect(TEAM_ROLES.filter(teamRoleNeedsIdCheck)).toEqual([
      "owner",
      "finance",
    ]);
  });

  it("recognises role codes", () => {
    expect(isTeamRole("front_desk")).toBe(true);
    expect(isTeamRole("admin")).toBe(false);
    expect(isTeamRole(null)).toBe(false);
  });
});
