// "On Abonten": the moving wall of hosts and places that are on Abonten
// (docs/architecture/showcase.md). Staff pick who is on it per market in
// Admin › Showcase; whether an entry shows is decided on every read.

export type ShowcaseAudience = "staff" | "beta" | "all";

/** Whether the wall is on for this caller. Fails closed. */
export type ShowcaseProgram = { enabled: boolean };

export const DISABLED_SHOWCASE_PROGRAM: ShowcaseProgram = { enabled: false };

/** A host's or a place's next event, by the Explore rule. */
export type ShowcaseNextEvent = {
  id: string;
  eventCode: string;
  title: string;
  /** The date that is on next (an event with several dates: that one). */
  startsAt: string;
  endsAt: string | null;
  /** The event's own zone: its day is read on its own clock. */
  timezone: string;
};

type ShowcaseTileBase = {
  /** The showcase entry: taps and follows are counted against it. */
  entryId: string;
  /** The organizer account (host) or the place. */
  subjectId: string;
  name: string;
  imagePublicId: string | null;
  imageVersion: string | null;
  verified: boolean;
  /** The signed-in viewer follows them (always false signed out). */
  following: boolean;
  nextEvent: ShowcaseNextEvent | null;
};

export type ShowcaseHostTile = ShowcaseTileBase & {
  kind: "host";
  username: string | null;
  /** A team account: the Verified badge is the business check. */
  isTeam: boolean;
};

export type ShowcasePlaceTile = ShowcaseTileBase & {
  kind: "place";
  slug: string;
  /** The account that runs it (Follow is hidden on your own place). */
  ownerId: string;
  /** Asked only when there is no next event to show instead. */
  openNow: boolean | null;
  categorySlug: string | null;
  categoryName: string | null;
  /** Its town: the address's city, else the launched city it is in. */
  area: string | null;
};

export type ShowcaseTile = ShowcaseHostTile | ShowcasePlaceTile;

/**
 * What the wall shows this viewer. Rows below the programme's minimum are
 * already empty; the whole section hides when both are.
 */
export type ShowcaseWall = {
  countryCode: string | null;
  regionId: string | null;
  regionName: string | null;
  hosts: ShowcaseHostTile[];
  places: ShowcasePlaceTile[];
};

/** Why an entry is not on the wall right now (null: it is). */
export type ShowcaseHiddenReason =
  | "market_closed"
  | "account_deleted"
  | "account_restricted"
  | "team_paused"
  | "no_upcoming_event"
  | "missing"
  | "other_market"
  | "ownerless"
  | "owner_restricted"
  | "not_published"
  | "moderated"
  | "permanently_closed"
  | "not_claimed";

export type ShowcaseSubjectKind = "host" | "place";

export type ShowcaseCounts = {
  taps7: number;
  follows7: number;
  taps30: number;
  follows30: number;
  tapsAll: number;
  followsAll: number;
};

/** One entry in Admin › Showcase. */
export type ShowcaseAdminEntry = {
  id: string;
  subjectKind: ShowcaseSubjectKind;
  subjectId: string;
  position: number;
  regionId: string | null;
  regionName: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  reason: ShowcaseHiddenReason | null;
  name: string;
  username: string | null;
  slug: string | null;
  imagePublicId: string | null;
  imageVersion: string | null;
  verified: boolean;
  isTeam: boolean;
  nextEvent: Omit<ShowcaseNextEvent, "endsAt"> | null;
  counts: ShowcaseCounts;
};

/** A host or place found in the console's search, before it is added. */
export type ShowcaseCandidate = {
  subjectKind: ShowcaseSubjectKind;
  subjectId: string;
  name: string;
  username: string | null;
  slug: string | null;
  /** A place's market; null for a host. */
  countryCode: string | null;
  imagePublicId: string | null;
  imageVersion: string | null;
  /** Would it show on this market's wall now (null: yes). */
  reason: ShowcaseHiddenReason | null;
  /** Already on this market's wall. */
  entryId: string | null;
};

/** A market in the console's chooser. */
export type ShowcaseMarketOption = {
  countryCode: string;
  name: string;
  status: string;
  isDefault: boolean;
};

/** A city of the market an entry can be limited to. */
export type ShowcaseCityOption = {
  id: string;
  name: string;
  launchStatus: string;
};

/** Admin › Showcase for one market. */
export type ShowcaseAdminView = {
  countryCode: string;
  markets: ShowcaseMarketOption[];
  cities: ShowcaseCityOption[];
  entries: ShowcaseAdminEntry[];
  /** How many entries of each row show right now. */
  showing: { hosts: number; places: number };
};

export type ShowcaseSettings = {
  enabled: boolean;
  audience: ShowcaseAudience;
  betaUserIds: string[];
  minPerRow: number;
  maxPerRow: number;
  updatedAt: string;
  updatedBy: string | null;
};
