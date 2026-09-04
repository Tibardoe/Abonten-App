// Shared type vocabulary for the Abonten Admin Console (apps/admin) and the
// user-facing reporting flow (apps/web + apps/mobile). One definition per
// concept — never a Web*/Mobile*/Admin* fork of the same backend state.
//
// Keep the string unions in lock-step with:
//   - supabase/migrations/20260907090*  (CHECK constraints + seed data)
//   - packages/core/src/adminPermissions.ts  (the role->permission matrix)

// ─────────────────────────────────────────────────────────────
// RBAC
// ─────────────────────────────────────────────────────────────

export type AdminRoleKey =
  | "super_admin"
  | "operations"
  | "moderator"
  | "finance_admin"
  | "support_admin"
  | "analyst";

export type AdminPermissionKey =
  | "dashboard.view"
  | "reports.view"
  | "reports.assign"
  | "reports.update_status"
  | "reports.request_info"
  | "reports.escalate"
  | "reports.note"
  | "reports.mark_false"
  | "reports.resolve"
  | "moderation.hide"
  | "moderation.remove"
  | "moderation.restore"
  | "moderation.restrict"
  | "users.view"
  | "users.view_pii"
  | "users.suspend"
  | "users.ban"
  | "users.restore"
  | "organizers.view"
  | "events.view"
  | "places.view"
  | "tickets.view"
  | "transactions.view"
  | "finance.view"
  | "finance.refund"
  | "finance.payout"
  | "finance.adjust"
  | "claims.view"
  | "claims.review"
  | "reviews.view"
  | "notifications.view"
  | "monitoring.view"
  | "monitoring.manage"
  | "incidents.manage"
  | "analytics.view"
  | "audit.view"
  | "settings.view"
  | "settings.manage"
  | "admins.manage";

export type AdminUserStatus = "active" | "disabled";

/** Resolved once per request by resolveAdminContext(); the authorization boundary. */
export type AdminContext = {
  userId: string;
  email: string | null;
  roles: AdminRoleKey[];
  permissions: AdminPermissionKey[];
  /** epoch ms of the most recent step-up re-auth, if any */
  reauthenticatedAt: number | null;
};

// ─────────────────────────────────────────────────────────────
// Reports
// ─────────────────────────────────────────────────────────────

export type ReportTargetType =
  | "event"
  | "place"
  | "event_review"
  | "place_review"
  | "user_review"
  | "user"
  | "organizer"
  | "highlight";

export type ReportCategory =
  | "spam"
  | "fraud_scam"
  | "misleading"
  | "harassment"
  | "inappropriate"
  | "fake_listing"
  | "safety"
  | "copyright"
  | "impersonation"
  | "other";

export type ReportStatus =
  | "new"
  | "under_review"
  | "awaiting_info"
  | "escalated"
  | "resolved"
  | "dismissed"
  | "false_report";

export type ReportPriority = "low" | "normal" | "high" | "urgent";

export type ReportSource = "web" | "mobile";

export const REPORT_OPEN_STATUSES: ReportStatus[] = [
  "new",
  "under_review",
  "awaiting_info",
  "escalated",
];

export const REPORT_TERMINAL_STATUSES: ReportStatus[] = [
  "resolved",
  "dismissed",
  "false_report",
];

/** Categories that should seed a higher default priority. */
export const HIGH_PRIORITY_CATEGORIES: ReportCategory[] = [
  "fraud_scam",
  "safety",
  "harassment",
  "impersonation",
];

/** Which categories make sense for which target — the reporting UI reads this. */
export const REPORTABLE_CATEGORIES: Record<ReportTargetType, ReportCategory[]> =
  {
    event: [
      "fraud_scam",
      "fake_listing",
      "misleading",
      "inappropriate",
      "safety",
      "spam",
      "copyright",
      "other",
    ],
    place: [
      "fake_listing",
      "misleading",
      "inappropriate",
      "safety",
      "spam",
      "copyright",
      "other",
    ],
    event_review: [
      "spam",
      "harassment",
      "inappropriate",
      "misleading",
      "other",
    ],
    place_review: [
      "spam",
      "harassment",
      "inappropriate",
      "misleading",
      "other",
    ],
    user_review: ["spam", "harassment", "inappropriate", "misleading", "other"],
    user: [
      "harassment",
      "impersonation",
      "spam",
      "inappropriate",
      "fraud_scam",
      "other",
    ],
    organizer: [
      "fraud_scam",
      "impersonation",
      "misleading",
      "inappropriate",
      "spam",
      "other",
    ],
    highlight: [
      "inappropriate",
      "harassment",
      "spam",
      "copyright",
      "safety",
      "other",
    ],
  };

export const REPORT_CATEGORY_LABEL: Record<ReportCategory, string> = {
  spam: "Spam",
  fraud_scam: "Fraud or scam",
  misleading: "Misleading information",
  harassment: "Harassment",
  inappropriate: "Inappropriate content",
  fake_listing: "Fake event / place",
  safety: "Safety concern",
  copyright: "Copyright issue",
  impersonation: "Impersonation",
  other: "Other",
};

export const REPORT_TARGET_LABEL: Record<ReportTargetType, string> = {
  event: "event",
  place: "place",
  event_review: "review",
  place_review: "review",
  user_review: "review",
  user: "profile",
  organizer: "organizer",
  highlight: "highlight",
};

export type ReportAttachmentInput = {
  storagePath: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

export type ReportListItem = {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  category: ReportCategory;
  status: ReportStatus;
  priority: ReportPriority;
  source: ReportSource;
  assignedTo: string | null;
  assignedToName: string | null;
  createdAt: string;
  updatedAt: string;
  /** total reports sharing this target (for the grouped queue view) */
  targetReportCount: number;
};

export type ReportGroupItem = {
  dedupeKey: string;
  targetType: ReportTargetType;
  targetId: string;
  reportCount: number;
  openCount: number;
  highestPriority: ReportPriority;
  latestCreatedAt: string;
  categories: ReportCategory[];
};

export type ReportTimelineEntry = {
  id: string;
  kind:
    | "created"
    | "assigned"
    | "status_changed"
    | "note_added"
    | "info_requested"
    | "escalated"
    | "action_taken"
    | "resolved"
    | "reopened";
  actorId: string | null;
  actorName: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
};

export type AdminNoteEntry = {
  id: string;
  authorId: string | null;
  authorName: string | null;
  body: string;
  createdAt: string;
};

export type ReportAttachmentView = {
  id: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  /** short-lived signed URL, minted server-side for staff only */
  url: string | null;
};

export type ReportReporterView = {
  id: string | null;
  username: string | null;
  fullName: string | null;
  /** only populated for callers holding users.view_pii */
  email: string | null;
  priorReportsByReporter: number;
};

export type ReportDetail = {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  category: ReportCategory;
  details: string | null;
  status: ReportStatus;
  priority: ReportPriority;
  source: ReportSource;
  assignedTo: string | null;
  assignedToName: string | null;
  resolution: string | null;
  resolutionAction: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  reporter: ReportReporterView;
  targetSnapshot: Record<string, unknown> | null;
  priorReportsOnTarget: number;
  timeline: ReportTimelineEntry[];
  notes: AdminNoteEntry[];
  attachments: ReportAttachmentView[];
};

// ─────────────────────────────────────────────────────────────
// Moderation
// ─────────────────────────────────────────────────────────────

export type ModerationState = "visible" | "restricted" | "hidden" | "removed";

export type ModerationActionKind =
  | "hide"
  | "unhide"
  | "remove"
  | "restore"
  | "restrict"
  | "unrestrict";

/** target types apply_moderation_action can actually flip (excludes user/organizer). */
export type ModeratableTargetType =
  | "event"
  | "place"
  | "event_review"
  | "place_review"
  | "user_review"
  | "highlight";

// ─────────────────────────────────────────────────────────────
// Users
// ─────────────────────────────────────────────────────────────

export type UserAccountStatus = "Active" | "Suspended" | "Banned";

export type AdminUserListItem = {
  id: string;
  username: string | null;
  fullName: string | null;
  email: string | null; // null unless users.view_pii
  status: UserAccountStatus;
  isAdmin: boolean;
  createdAt: string | null;
  eventCount: number;
  reportsAgainstCount: number;
};

export type AdminUserDetail = {
  id: string;
  username: string | null;
  fullName: string | null;
  bio: string | null;
  website: string | null;
  avatarPublicId: string | null;
  status: UserAccountStatus;
  isAdmin: boolean;
  email: string | null; // null unless users.view_pii
  phone: string | null; // null unless users.view_pii
  createdAt: string | null;
  lastSignInAt: string | null;
  stats: {
    eventsOrganized: number;
    ticketsPurchased: number;
    reviewsWritten: number;
    reportsFiled: number;
    reportsAgainst: number;
    claimsFiled: number;
  };
  recentReportsAgainst: ReportListItem[];
};

// ─────────────────────────────────────────────────────────────
// Audit log
// ─────────────────────────────────────────────────────────────

export type AuditLogEntry = {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorRoles: string[];
  action: string;
  targetType: string | null;
  targetId: string | null;
  summary: string | null;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  requestMeta: Record<string, unknown> | null;
  createdAt: string;
};

// ─────────────────────────────────────────────────────────────
// Monitoring / observability
// ─────────────────────────────────────────────────────────────

export type ObservedPlatform = "web" | "mobile" | "api";

export type ErrorGroupStatus = "open" | "acknowledged" | "resolved" | "ignored";

export type ErrorGroup = {
  fingerprint: string;
  title: string;
  errorType: string | null;
  sampleMessage: string | null;
  firstSeen: string;
  lastSeen: string;
  eventCount: number;
  platforms: ObservedPlatform[];
  lastRoute: string | null;
  lastAppVersion: string | null;
  status: ErrorGroupStatus;
  assignedTo: string | null;
};

export type ErrorEventSample = {
  id: string;
  message: string | null;
  stack: string | null;
  platform: ObservedPlatform;
  route: string | null;
  appVersion: string | null;
  severity: "info" | "warning" | "error" | "fatal";
  context: Record<string, unknown> | null;
  occurredAt: string;
};

export type HealthCheckKey =
  | "db"
  | "auth"
  | "storage"
  | "paystack"
  | "resend"
  | "hubtel"
  | "push"
  | "cloudinary";

export type HealthCheckSnapshot = {
  key: HealthCheckKey;
  ok: boolean;
  latencyMs: number | null;
  detail: Record<string, unknown> | null;
  checkedAt: string | null;
};

export type MetricsOverviewPoint = {
  bucket: string;
  platform: ObservedPlatform;
  total: number;
  okCount: number;
  errCount: number;
  p50Ms: number | null;
  p95Ms: number | null;
};

export type IncidentStatus =
  | "investigating"
  | "identified"
  | "monitoring"
  | "resolved";

export type Incident = {
  id: string;
  title: string;
  status: IncidentStatus;
  severity: "low" | "medium" | "high" | "critical";
  component: string | null;
  summary: string | null;
  startedAt: string;
  resolvedAt: string | null;
  createdBy: string | null;
  updatedAt: string;
};

// ─────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────

export type DashboardRange =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "90d"
  | "custom";

export type DashboardKpis = {
  totalUsers: number;
  newUsers: number;
  organizers: number;
  events: number;
  places: number;
  ticketsSold: number;
  grossTicketSales: number;
  platformFeeRevenue: number;
  refunds: number;
  currency: string;
};

export type NeedsAttention = {
  openReports: number;
  urgentReports: number;
  reportsUnassigned: number;
  pendingClaims: number;
  openErrorGroups: number;
  failingHealthChecks: number;
  stuckPayments: number;
  pendingRefunds: number;
  pendingPayouts: number;
};

export type DashboardSnapshot = {
  range: DashboardRange;
  from: string;
  to: string;
  kpis: DashboardKpis;
  health: HealthCheckSnapshot[];
  needsAttention: NeedsAttention;
};

// ─────────────────────────────────────────────────────────────
// Phase 2 — Claims, Content moderation browse, Catalog (events /
// places / organizers) read modules
// ─────────────────────────────────────────────────────────────

export type ClaimStatus = "pending" | "approved" | "rejected";

export type ClaimListItem = {
  id: string;
  status: ClaimStatus;
  placeId: string;
  placeName: string | null;
  placeSlug: string | null;
  claimantId: string;
  claimantName: string | null;
  documentCount: number;
  contactEmail: string | null; // only for users.view_pii
  contactPhone: string | null; // only for users.view_pii
  createdAt: string;
  reviewedAt: string | null;
};

export type ClaimDocumentView = {
  id: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  /** short-lived signed URL, minted server-side */
  url: string | null;
};

export type ClaimDetail = {
  id: string;
  status: ClaimStatus;
  note: string | null;
  contactEmail: string | null; // only for users.view_pii
  contactPhone: string | null; // only for users.view_pii
  createdAt: string;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  place: {
    id: string;
    name: string | null;
    slug: string | null;
    status: string | null;
    currentOwnerId: string | null;
    claimed: boolean;
    verified: boolean;
  };
  claimant: {
    id: string;
    username: string | null;
    fullName: string | null;
    email: string | null; // only for users.view_pii
  };
  documents: ClaimDocumentView[];
  notes: AdminNoteEntry[];
};

export type ModeratableContentItem = {
  targetType: ModeratableTargetType;
  id: string;
  /** best-effort human label (title / name / comment snippet) */
  label: string;
  ownerId: string | null;
  ownerName: string | null;
  moderationState: ModerationState | null;
  moderatedAt: string | null;
  status: string | null;
  reportCount: number;
  createdAt: string;
};

export type EventAdminListItem = {
  id: string;
  title: string;
  eventCode: string | null;
  status: string;
  moderationState: ModerationState | null;
  organizerId: string;
  organizerName: string | null;
  startsAt: string | null;
  featured: boolean;
  reportCount: number;
  createdAt: string;
};

export type EventAdminDetail = EventAdminListItem & {
  description: string | null;
  category: string | null;
  address: Record<string, unknown> | string | null;
  capacity: number | null;
  placeId: string | null;
  ticketsSold: number;
  grossSales: number;
  currency: string;
  avgRating: number;
  reviewCount: number;
  moderationReason: string | null;
  recentReports: ReportListItem[];
  notes: AdminNoteEntry[];
};

export type PlaceAdminListItem = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  moderationState: ModerationState | null;
  ownerId: string | null;
  ownerName: string | null;
  claimed: boolean;
  verified: boolean;
  reportCount: number;
  createdAt: string;
};

export type PlaceAdminDetail = PlaceAdminListItem & {
  description: string | null;
  address: Record<string, unknown> | string | null;
  categoryId: number | null;
  avgRating: number;
  reviewCount: number;
  upcomingEventCount: number;
  moderationReason: string | null;
  pendingClaimCount: number;
  recentReports: ReportListItem[];
  notes: AdminNoteEntry[];
};

export type OrganizerListItem = {
  id: string;
  username: string | null;
  fullName: string | null;
  accountStatus: UserAccountStatus;
  eventCount: number;
  placeCount: number;
  ticketsSold: number;
  reportsAgainst: number;
  createdAt: string | null;
};

export type OrganizerDetail = {
  id: string;
  username: string | null;
  fullName: string | null;
  bio: string | null;
  accountStatus: UserAccountStatus;
  isAdmin: boolean;
  email: string | null; // only for users.view_pii
  createdAt: string | null;
  stats: {
    events: number;
    places: number;
    ticketsSold: number;
    grossSales: number;
    currency: string;
    avgOrganizerRating: number;
    organizerRatingCount: number;
    reportsAgainst: number;
    hiddenOrRemovedContent: number;
  };
  recentEvents: EventAdminListItem[];
  places: PlaceAdminListItem[];
  recentReportsAgainst: ReportListItem[];
  notes: AdminNoteEntry[];
};
