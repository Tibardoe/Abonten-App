// Abonten Safety: trusted contacts, SOS, check-ins and live location.
// Mirrors supabase/migrations/20261021180000_safety_core.sql; the design is
// docs/architecture/safety.md.

export type SafetyAudience = "staff" | "beta" | "all";

export type SafetySessionKind = "sos" | "check_in" | "share";

/** active → alerting → resolved | expired (a share or check-in may skip alerting). */
export type SafetySessionStatus =
  | "active"
  | "alerting"
  | "resolved"
  | "expired";

export type SafetyAlertReason = "sos" | "check_in_missed";

export type SafetyResolution = "safe" | "false_alarm" | "ended" | "expired";

export type SafetyContactStatus = "pending" | "accepted" | "declined";

export type SafetyRelationship =
  | "family"
  | "partner"
  | "friend"
  | "roommate"
  | "colleague"
  | "other";

export type SafetyAcknowledgement = "on_my_way" | "calling" | "cant_help";

export type SafetyMessagePurpose =
  | "invite"
  | "share"
  | "alert"
  | "check_in_missed"
  | "safe"
  | "false_alarm"
  | "event_team";

export type SafetyChannel = "sms" | "email" | "push";

export type SafetyDeliveryState =
  | "none"
  | "pending"
  | "sending"
  | "sent"
  | "failed"
  | "skipped";

export type SafetyEmergencyService = "all" | "police" | "ambulance" | "fire";

export type SafetyEmergencyNumber = {
  service: SafetyEmergencyService;
  number: string;
};

/** What the signed-in person may use. Fails closed. */
export type SafetyProgram = {
  enabled: boolean;
  checkIn: boolean;
  share: boolean;
  eventTeam: boolean;
  maxContacts: number;
  checkInGraceMinutes: number;
  shareMaxHours: number;
};

export const DISABLED_SAFETY_PROGRAM: SafetyProgram = {
  enabled: false,
  checkIn: false,
  share: false,
  eventTeam: false,
  maxContacts: 0,
  checkInGraceMinutes: 5,
  shareMaxHours: 12,
};

export type SafetyContact = {
  id: string;
  name: string;
  phoneE164: string;
  email: string | null;
  relationship: SafetyRelationship;
  locale: string;
  position: number;
  status: SafetyContactStatus;
  /** Accepted while signed in to Abonten: also gets alerts as a push. */
  linked: boolean;
  invitedAt: string | null;
  inviteCount: number;
  respondedAt: string | null;
  /** Abonten can text this number (it is in a market with a text rail). */
  canText: boolean;
  /** The invite may be sent again now. */
  canResendInvite: boolean;
  createdAt: string;
};

export type SafetyLocationPoint = {
  lat: number;
  lng: number;
  accuracyM: number | null;
  at: string;
};

/** What a contact sees of where the person is. */
export type SafetyLocationState = "live" | "stale" | "none" | "hidden";

export type SafetyEventContext = {
  id: string;
  title: string;
  code: string;
  venue: string | null;
  address: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  /** "ongoing" now, "upcoming" later, "ended" recently. */
  timing: "ongoing" | "upcoming" | "ended";
  /**
   * Contact view only: the venue's public numbers from its Abonten page, so
   * a contact can ring the people on site.
   */
  venuePhone?: string | null;
  venueWhatsapp?: string | null;
  /**
   * Contact view only: who runs the event, as their public profile shows
   * it. Never their legal identity: that stays with Abonten staff
   * (docs/architecture/identity-verification.md).
   */
  organizer?: {
    name: string;
    identityChecked: boolean;
    verified: boolean;
  } | null;
};

export type SafetyRecipientState = {
  id: string;
  kind: "contact" | "event_team";
  contactId: string | null;
  name: string;
  channels: Record<SafetyChannel, SafetyDeliveryState>;
  /** One word for the row: the best of the channels. */
  delivery: SafetyDeliveryState;
  viewedAt: string | null;
  acknowledgement: SafetyAcknowledgement | null;
  acknowledgedAt: string | null;
};

export type SafetySession = {
  id: string;
  kind: SafetySessionKind;
  status: SafetySessionStatus;
  startedAt: string;
  dueAt: string | null;
  endsAt: string;
  alertedAt: string | null;
  alertReason: SafetyAlertReason | null;
  resolvedAt: string | null;
  resolution: SafetyResolution | null;
  note: string | null;
  event: SafetyEventContext | null;
  eventTeamNotifiedAt: string | null;
  /** "Tell the event team" may be offered now. */
  canTellEventTeam: boolean;
  lastLocation: SafetyLocationPoint | null;
  recipients: SafetyRecipientState[];
  /**
   * Contacts Abonten could not text (no text rail for their number, daily
   * limit, a failed send): the app offers to text them from the phone.
   */
  textFromPhone: { name: string; phoneE164: string }[];
};

export type SafetySessionSummary = {
  id: string;
  kind: SafetySessionKind;
  status: SafetySessionStatus;
  startedAt: string;
  alertedAt: string | null;
  resolvedAt: string | null;
  resolution: SafetyResolution | null;
  recipientCount: number;
  eventTitle: string | null;
};

export type SafetyOverview = {
  program: SafetyProgram;
  /** A verified phone is required before contacts can be added. */
  phone: { verified: boolean; e164: string | null };
  /** The profile has no name yet: contacts would not know who it is. */
  needsName: boolean;
  contacts: SafetyContact[];
  active: SafetySession | null;
  recent: SafetySessionSummary[];
  /** Events the person has a ticket for that are on now, soon or just ended. */
  eventChoices: SafetyEventContext[];
  emergencyNumbers: SafetyEmergencyNumber[];
  countryCode: string;
  timezone: string;
};

export type StartSafetySessionResult = {
  session: SafetySession;
  /** False when the same request id had already started it. */
  created: boolean;
  /** True when SOS turned an open check-in or share into an alert. */
  escalated: boolean;
};

export type SafetyTimelineEntry = {
  kind:
    | "started"
    | "alerted"
    | "note"
    | "extended"
    | "event_team"
    | "viewed"
    | "acknowledged"
    | "resolved"
    | "expired"
    | "reminded";
  at: string;
  /** The contact who viewed / answered. */
  name: string | null;
  acknowledgement: SafetyAcknowledgement | null;
  resolution: SafetyResolution | null;
  reason: SafetyAlertReason | null;
};

/** The contact's page (/sos/<token>). */
export type SafetyView = {
  sessionId: string;
  kind: SafetySessionKind;
  status: SafetySessionStatus;
  alertReason: SafetyAlertReason | null;
  startedAt: string;
  alertedAt: string | null;
  dueAt: string | null;
  endsAt: string;
  resolvedAt: string | null;
  resolution: SafetyResolution | null;
  person: { name: string; avatarUrl: string | null; phoneE164: string | null };
  note: string | null;
  event: SafetyEventContext | null;
  locationState: SafetyLocationState;
  location: SafetyLocationPoint | null;
  trail: SafetyLocationPoint[];
  emergencyNumbers: SafetyEmergencyNumber[];
  viewer: {
    name: string;
    kind: "contact" | "event_team";
    acknowledgement: SafetyAcknowledgement | null;
    acknowledgedAt: string | null;
  };
  timeline: SafetyTimelineEntry[];
  /** How often the page should ask again; null once the session is closed. */
  pollSeconds: number | null;
  /** The person's time zone, for times on the page. */
  timezone: string;
  now: string;
};

/** The invite page (/trusted/<token>). */
export type SafetyInviteView = {
  personName: string;
  contactName: string;
  status: SafetyContactStatus;
  /** This number asked not to be texted by anyone through Abonten Safety. */
  blockedEveryone: boolean;
};

export type SafetyInviteResponse = "accept" | "decline" | "block_all";

/** Admin › Safety. Never carries a position. */
export type SafetyAdminSettings = {
  enabled: boolean;
  audience: SafetyAudience;
  betaUserIds: string[];
  checkInEnabled: boolean;
  shareEnabled: boolean;
  eventTeamAlertsEnabled: boolean;
  maxContacts: number;
  alertsWithSmsPerDay: number;
  invitesPerDay: number;
  checkInGraceMinutes: number;
  alertHours: number;
  shareMaxHours: number;
  locationRetentionDays: number;
  sessionRetentionDays: number;
  updatedAt: string;
  updatedBy: string | null;
};

export type SafetyAdminSessionRow = {
  id: string;
  userId: string;
  userName: string | null;
  kind: SafetySessionKind;
  status: SafetySessionStatus;
  alertReason: SafetyAlertReason | null;
  resolution: SafetyResolution | null;
  startedAt: string;
  alertedAt: string | null;
  resolvedAt: string | null;
  recipients: number;
  viewed: number;
  acknowledged: number;
  messagesSent: number;
  messagesFailed: number;
  eventTitle: string | null;
  createdVia: "app" | "web";
};

export type SafetyAdminMessageRow = {
  id: number;
  recipientName: string | null;
  purpose: SafetyMessagePurpose;
  channel: SafetyChannel;
  status: SafetyDeliveryState;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
};

export type SafetyAdminSessionDetail = SafetyAdminSessionRow & {
  dueAt: string | null;
  endsAt: string;
  hasNote: boolean;
  locationCount: number;
  lastLocatedAt: string | null;
  recipientsDetail: {
    id: string;
    kind: "contact" | "event_team";
    name: string;
    maskedPhone: string | null;
    viewedAt: string | null;
    viewCount: number;
    acknowledgement: SafetyAcknowledgement | null;
    acknowledgedAt: string | null;
  }[];
  messages: SafetyAdminMessageRow[];
  timeline: SafetyTimelineEntry[];
};

export type SafetyAdminOverview = {
  windowDays: number;
  sessionsByKind: Record<SafetySessionKind, number>;
  alerts: number;
  missedCheckIns: number;
  falseAlarms: number;
  openNow: number;
  messages: { sent: number; failed: number; pending: number };
  contacts: { total: number; accepted: number; declined: number };
  peopleWithContacts: number;
};
