// Team accounts (docs/architecture/team-accounts.md). Codes only: the
// words come from i18n.

export type TeamRoleCode =
  | "owner"
  | "finance"
  | "manager"
  | "content"
  | "door"
  | "front_desk";

export type TeamStatus = "active" | "frozen" | "closed";
export type TeamAudience = "staff" | "beta" | "all";
export type TeamInviteStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "expired";

/** What a person sees of the programme. */
export type TeamProgram = {
  enabled: boolean;
  /**
   * The team terms to accept when making a team (N4), when Abonten has
   * published some; absent or null = nothing to accept.
   */
  terms?: TeamTerms | null;
};

/** A published version of the team terms, and where it is read. */
export type TeamTerms = {
  version: string;
  /** A path on the website, e.g. /legal/terms#team-accounts. */
  path: string;
};

/** A person as a team shows them: public profile fields only. */
export type TeamPerson = {
  id: string;
  name: string | null;
  username: string | null;
  avatarPublicId: string | null;
  avatarVersion: string | null;
};

/** A team as its members see it in their list. */
export type TeamSummary = {
  id: string;
  name: string | null;
  username: string | null;
  avatarPublicId: string | null;
  avatarVersion: string | null;
  status: TeamStatus;
  /** The caller's role in it. */
  role: TeamRoleCode;
  memberCount: number;
  /**
   * The team carries the organizer badge ("Verified business"); renaming it
   * sends the badge back to review (X42).
   */
  verified?: boolean;
};

export type TeamMember = {
  person: TeamPerson;
  role: TeamRoleCode;
  joinedAt: string;
  /** Whether this member passed the ID check (shown for Owner/Finance). */
  idChecked: boolean;
  /**
   * Front desk and Door staff limited to some of the team's places (a
   * chain); null = all its places. Shown to Owners.
   */
  placeIds?: string[] | null;
};

export type TeamInviteSent = {
  id: string;
  role: TeamRoleCode;
  /** Set when the invitation names an account. */
  to: TeamPerson | null;
  /** Set when it went to a number with no account: masked. */
  toPhoneMasked: string | null;
  /** For a number with no account: whether the invitation text went. */
  toPhoneTexted: boolean | null;
  invitedBy: TeamPerson | null;
  createdAt: string;
  expiresAt: string;
};

export type TeamActivityEntry = {
  id: number;
  /** Null for the system; a member who has gone keeps their name here. */
  actor: TeamPerson | null;
  action: string;
  subjectKind: string | null;
  subjectId: string | null;
  /** The person a member action is about, when there is one. */
  subject: TeamPerson | null;
  details: Record<string, unknown>;
  createdAt: string;
};

/** One team, as a member sees it. Owners also get invitations and activity. */
export type TeamDetail = {
  team: TeamSummary;
  members: TeamMember[];
  invites: TeamInviteSent[] | null;
  activity: TeamActivityEntry[] | null;
  /**
   * The published team terms (N4) and who accepted them: the page asks an
   * Owner who has not; the team's money waits until one Owner has.
   */
  terms?:
    | (TeamTerms & { acceptedByMe: boolean; acceptedByAnOwner: boolean })
    | null;
  /** The team's places, for limiting Front desk and Door staff (Owners). */
  places?: { id: string; name: string }[] | null;
};

/** An invitation waiting for the caller. */
export type TeamInviteReceived = {
  id: string;
  role: TeamRoleCode;
  team: TeamPerson;
  invitedBy: TeamPerson | null;
  createdAt: string;
  expiresAt: string;
};

export type TeamsOverview = {
  program: TeamProgram;
  teams: TeamSummary[];
  invites: TeamInviteReceived[];
  /**
   * "Make this a team": the person runs events or places of their own, so
   * their account can become a team (absent = no).
   */
  canConvert?: boolean;
};

/** What "make this a team" moved to the new team. */
/**
 * Moving one's own event (its whole run) into a team the person is an
 * Owner of (docs/architecture/team-accounts.md, "Move events into a team").
 */
export type MoveEventToTeamOptions = {
  /** Active teams the person is an Owner of; empty: nothing to offer. */
  teams: { id: string; name: string | null; username: string | null }[];
  /** How many listings would move: the event, or every show of its run. */
  eventCount: number;
  /** People bought or registered already: it stays where it is. */
  hasSales: boolean;
};

export type MoveEventToTeamResult = {
  team: { id: string; name: string | null; role: TeamRoleCode };
  events: number;
};

export type TeamConversion = {
  team: TeamSummary;
  events: number;
  places: number;
  followers: number;
  /** The person's new handle (the team took theirs). */
  personUsername: string;
  /**
   * The organizer badge moved under another name, or had been granted to an
   * individual: it is back in review (X42).
   */
  badgeBackInReview: boolean;
};

export type InviteTarget =
  | { kind: "username"; username: string }
  | { kind: "phone"; phone: string };

/** Admin › Teams. */
export type TeamAdminSettings = {
  enabled: boolean;
  audience: TeamAudience;
  betaUserIds: string[];
  maxTeamsCreated: number;
  maxMembers: number;
  inviteHours: number;
  textsPerTeamPerDay: number;
  termsVersion: string | null;
  termsPath: string;
  /** When staff recorded counsel's approval of N4, N5, N9 and K7. */
  launchClearedAt: string | null;
  launchClearedBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
};

/** What Admin › Teams shows before "Everyone" can be chosen. */
export type TeamLaunchReadiness = {
  termsPublished: boolean;
  /** ID checks for Owners and Finance (X5, N5) need the identity programme. */
  identity: {
    enabled: boolean;
    audience: string;
    requireForPayouts: boolean;
  } | null;
  clearedByName: string | null;
};

export type TeamAdminRow = {
  id: string;
  name: string | null;
  username: string | null;
  status: TeamStatus;
  statusReason: string | null;
  createdAt: string;
  createdBy: TeamPerson | null;
  owners: TeamPerson[];
  memberCount: number;
};

/** A team the person may manage as (the "Managing as" choice). */
export type ActingTeam = {
  id: string;
  name: string | null;
  username: string | null;
  avatarPublicId: string | null;
  avatarVersion: string | null;
  role: TeamRoleCode;
};

/** The teams a person may manage as, and whether teams are switched on. */
export type ActingTeams = { teams: ActingTeam[]; programEnabled: boolean };
