// Team roles and what each may do for its team (Tickets, entry and teams
// plan, Part 2; decision X5). The database keeps the same matrix in
// public.team_role_can(): change the two together (a unit test pins this
// copy, and the migration's checks pin the SQL one).

export const TEAM_ROLES = [
  "owner",
  "finance",
  "manager",
  "content",
  "door",
  "front_desk",
] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const TEAM_CAPABILITIES = [
  /** Invite, remove and change the roles of members. */
  "team.members",
  /** The team's name, photo and bio. */
  "team.profile",
  /** Change the payout account (also needs a fresh sign-in). */
  "payout.manage",
  /** See the payout account and payouts. */
  "payout.view",
  /** Ask for a payout to the team's payout account. */
  "payout.request",
  /** Earnings, balances and money reports. */
  "money.view",
  /** Refund buyers. */
  "refunds.issue",
  /** Feature the team's events and places, paying with its credit. */
  "promotions.buy",
  "events.manage",
  "places.manage",
  "promo.manage",
  "bookings.manage",
  /** The attendee list with names. */
  "attendees.view",
  /** Scan tickets at the door. */
  "checkin.scan",
  /** Answer messages to the team. */
  "messages.reply",
  /** Spotlight and Stories. */
  "content.post",
  "reviews.reply",
  /** Show a place's visit QR. */
  "visit.show",
] as const;
export type TeamCapability = (typeof TEAM_CAPABILITIES)[number];

const ROLE_CAPABILITIES: Record<TeamRole, readonly TeamCapability[]> = {
  owner: TEAM_CAPABILITIES,
  finance: [
    "money.view",
    "refunds.issue",
    "payout.view",
    "payout.request",
    "promotions.buy",
  ],
  manager: [
    "events.manage",
    "places.manage",
    "promo.manage",
    "bookings.manage",
    "attendees.view",
    "checkin.scan",
  ],
  content: ["messages.reply", "content.post", "reviews.reply"],
  door: ["checkin.scan"],
  front_desk: ["bookings.manage", "visit.show"],
};

export function isTeamRole(value: unknown): value is TeamRole {
  return (
    typeof value === "string" &&
    (TEAM_ROLES as readonly string[]).includes(value)
  );
}

/** Whether a member in this role may do this for the team. */
export function teamRoleCan(
  role: TeamRole,
  capability: TeamCapability,
): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

/** Everything a role may do, in the order of TEAM_CAPABILITIES. */
export function teamRoleCapabilities(role: TeamRole): TeamCapability[] {
  return TEAM_CAPABILITIES.filter((c) => teamRoleCan(role, c));
}

/**
 * Roles whose members must pass the ID check (X5): the ones that can move
 * money.
 */
export function teamRoleNeedsIdCheck(role: TeamRole): boolean {
  return role === "owner" || role === "finance";
}
