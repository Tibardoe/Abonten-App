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
};

export type TeamMember = {
  person: TeamPerson;
  role: TeamRoleCode;
  joinedAt: string;
  /** Whether this member passed the ID check (shown for Owner/Finance). */
  idChecked: boolean;
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
  updatedAt: string;
  updatedBy: string | null;
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
