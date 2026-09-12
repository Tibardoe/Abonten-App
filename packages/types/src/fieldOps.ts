// Field Ops (regional promotion & field operations programme) types shared
// by the admin console, the web `/field` area and, later, the mobile app.
// Amounts crossing the API are minor units (`*Minor`, integers) in the
// campaign's currency. Shapes mirror the fieldops_* tables (migration
// fieldops_core) -- one definition per concept.

export type FieldOpsCampaignStatus =
  | "draft"
  | "active"
  | "paused"
  | "winding_down"
  | "completed"
  | "archived";

export type FieldOpsCampaignAction =
  | "activate"
  | "pause"
  | "resume"
  | "wind_down"
  | "complete"
  | "archive";

export type FieldOpsMemberRole =
  | "team_lead"
  | "content_creator"
  | "offline_member"
  | "online_member";

export type FieldOpsMemberStatus = "invited" | "active" | "suspended" | "left";

export type FieldOpsTerritoryKind = "town" | "area";

export type FieldOpsTerritoryStatus = "active" | "completed" | "retired";

export type FieldOpsRegionStatus = "active" | "retired";

export type FieldOpsActivityKey =
  | "place_onboarding_offline"
  | "place_onboarding_online"
  | "event_onboarding_offline"
  | "event_onboarding_online"
  | "existing_place_claim_assist"
  | "content_deliverable"
  | "content_monthly_stipend"
  | "team_lead_monthly_stipend";

export type FieldOpsReleasePolicy =
  | "holding_period"
  | "event_started"
  | "claim_approved";

/** The one-row programme settings (fieldops_program_setting). */
export type FieldOpsProgramSettings = {
  programEnabled: boolean;
  workerUiEnabled: boolean;
  commissionGenerationEnabled: boolean;
  payoutsEnabled: boolean;
  requireMemberPhoneVerified: boolean;
  defaultHoldingDays: number;
  duplicateRadiusM: number;
  /** 0..1 */
  duplicateNameSimilarity: number;
  offlineMaxDistanceM: number;
  dailySubmissionCap: number;
  spotCheckBps: number;
  reviewGraceDays: number;
  evidenceRetentionDays: number;
  notifyPushEnabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
};

export type FieldOpsRegion = {
  id: string;
  name: string;
  countryCode: string;
  adminCode: string | null;
  centre: { lat: number; lng: number } | null;
  status: FieldOpsRegionStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Counts for list views. */
  territoryCount: number;
  liveCampaignId: string | null;
};

export type FieldOpsTerritory = {
  id: string;
  regionId: string;
  parentTerritoryId: string | null;
  name: string;
  kind: FieldOpsTerritoryKind;
  centre: { lat: number; lng: number };
  radiusM: number;
  /** GeoJSON polygon when a boundary has been drawn; null = circle. */
  boundary: GeoJsonPolygon | null;
  status: FieldOpsTerritoryStatus;
  priority: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: [number, number][][];
};

export type FieldOpsCampaign = {
  id: string;
  regionId: string;
  regionName: string;
  name: string;
  slug: string;
  status: FieldOpsCampaignStatus;
  currency: string;
  startsOn: string | null;
  endsOn: string | null;
  budgetCapMinor: number | null;
  holdingDaysOverride: number | null;
  description: string | null;
  statusChangedAt: string;
  statusChangedBy: string | null;
  activatedAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Team summary for list/detail views. */
  teamId: string | null;
  memberCounts: Record<FieldOpsMemberRole, number>;
  activeMemberCount: number;
};

export type FieldOpsTeamMember = {
  id: string;
  teamId: string;
  campaignId: string;
  userId: string | null;
  /** Masked (e.g. +233 24 *** 1234); the full number is never sent to a client. */
  invitedPhoneMasked: string | null;
  fullName: string | null;
  username: string | null;
  role: FieldOpsMemberRole;
  status: FieldOpsMemberStatus;
  joinedAt: string | null;
  leftAt: string | null;
  suspendedReason: string | null;
  /** Whether the member's account has a verified phone (admin view). */
  phoneVerified: boolean | null;
  /** Masked payout destination, admin view only. */
  payoutDestinationMasked: string | null;
  createdAt: string;
};

export type FieldOpsCommissionRule = {
  id: string;
  campaignId: string | null;
  activityKey: FieldOpsActivityKey;
  version: number;
  isActive: boolean;
  amountMinor: number;
  currency: string;
  eligibility: Record<string, unknown>;
  effectiveFrom: string;
  note: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
};

/** One membership as seen by the person themselves (fieldops_my_memberships). */
export type FieldOpsMembership = {
  membershipId: string;
  campaignId: string;
  teamId: string;
  regionId: string;
  role: FieldOpsMemberRole;
  status: Extract<FieldOpsMemberStatus, "active" | "suspended">;
  campaignStatus: FieldOpsCampaignStatus;
  campaignName: string;
  currency: string;
  joinedAt: string | null;
};

export type FieldOpsAdminOverview = {
  settings: FieldOpsProgramSettings;
  killSwitchOn: boolean;
  campaigns: FieldOpsCampaign[];
  regionCount: number;
  territoryCount: number;
  liveRuleCount: number;
  /** Phase 3: what the programme owes, and what needs a human. */
  money: {
    pendingMinor: number;
    approvedMinor: number;
    paidMinor: number;
    currency: string;
  };
  awaitingReview: number;
  flagged: number;
  succeeded: number;
  /** Sweep lag and stuck work, from fieldops_health(). */
  sweepLagSeconds: number;
};

// ── Phase 1: assignments, prospects, the /field shell ───────

export type FieldOpsAssignmentMode = "offline" | "online";

export type FieldOpsAssignmentStatus =
  | "assigned"
  | "started"
  | "completed"
  | "cancelled";

/** One member working one territory over a date range (fieldops_assignment). */
export type FieldOpsAssignment = {
  id: string;
  campaignId: string;
  teamId: string;
  memberId: string;
  memberUserId: string;
  memberName: string | null;
  memberRole: FieldOpsMemberRole;
  territoryId: string;
  territoryName: string;
  territoryKind: FieldOpsTerritoryKind;
  mode: FieldOpsAssignmentMode;
  /** YYYY-MM-DD, inclusive. */
  startsOn: string;
  endsOn: string;
  status: FieldOpsAssignmentStatus;
  startedAt: string | null;
  startLocation: { lat: number; lng: number } | null;
  startAccuracyM: number | null;
  /** Metres from the territory centre at check-in (offline mode). */
  startDistanceM: number | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  assignedBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FieldOpsProspectKind = "place" | "event" | "organizer";

export type FieldOpsProspectStatus =
  | "identified"
  | "contacted"
  | "interested"
  | "declined"
  | "converted";

export type FieldOpsContactChannel =
  | "in_person"
  | "phone"
  | "whatsapp"
  | "social"
  | "email";

export type FieldOpsContactOutcome =
  | "no_answer"
  | "call_back"
  | "interested"
  | "declined"
  | "other";

export type FieldOpsContactAttempt = {
  at: string;
  channel: FieldOpsContactChannel;
  outcome: FieldOpsContactOutcome;
  note: string | null;
};

/** A business or organizer a member identified in a territory (fieldops_prospect). */
export type FieldOpsProspect = {
  id: string;
  campaignId: string;
  teamId: string;
  territoryId: string;
  memberId: string;
  memberUserId: string;
  memberName: string | null;
  kind: FieldOpsProspectKind;
  name: string;
  contactName: string | null;
  /** Masked for everyone but the member who logged it. */
  contactPhoneMasked: string | null;
  contactChannel: FieldOpsContactChannel | null;
  status: FieldOpsProspectStatus;
  contactAttempts: FieldOpsContactAttempt[];
  matchedPlaceId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

/** The campaign as a member sees it: no budget, no rules, no team internals. */
export type FieldOpsCampaignSummary = {
  id: string;
  name: string;
  status: FieldOpsCampaignStatus;
  currency: string;
  regionId: string;
  regionName: string;
  startsOn: string | null;
  endsOn: string | null;
};

/** Everything the /field "Today" screen needs, in one call. */
export type FieldOpsMe = {
  /** Programme switch + kill switch. False = /field does not exist. */
  programEnabled: boolean;
  memberships: FieldOpsMembership[];
  /** The membership /field shows (live campaign first, then draft, then the latest). */
  current: {
    membership: FieldOpsMembership;
    campaign: FieldOpsCampaignSummary;
    isLead: boolean;
    /** Assignments covering today (UTC), open ones first. */
    todayAssignments: FieldOpsAssignment[];
    stats: {
      openAssignments: number;
      completedAssignments: number;
      prospects: number;
      prospectsContacted: number;
    };
    /** Server's idea of today, YYYY-MM-DD (UTC). */
    today: string;
  } | null;
};

export type FieldOpsTerritoryCoverage = "covered" | "completed" | "uncovered";

/** A territory with who is on it, for the lead's coverage board. */
export type FieldOpsTerritoryBoardRow = FieldOpsTerritory & {
  coverage: FieldOpsTerritoryCoverage;
  openAssignments: {
    id: string;
    memberId: string;
    memberName: string | null;
    mode: FieldOpsAssignmentMode;
    status: FieldOpsAssignmentStatus;
    startsOn: string;
    endsOn: string;
  }[];
  prospectCount: number;
};

export type FieldOpsLeadDashboard = {
  campaign: FieldOpsCampaignSummary;
  today: string;
  territories: FieldOpsTerritoryBoardRow[];
  coveragePct: number;
  todayAssignments: FieldOpsAssignment[];
  team: { active: number; invited: number; suspended: number };
  /** Members who can take assignments (active offline/online members). */
  assignableMembers: {
    id: string;
    name: string | null;
    role: FieldOpsMemberRole;
  }[];
};

// ── Phase 2: onboarding, owner OTP, evidence, lead review ───

export type FieldOpsOnboardingStatus =
  | "draft"
  | "submitted"
  | "needs_changes"
  | "verified"
  | "flagged"
  | "succeeded"
  | "rejected"
  | "withdrawn";

export type FieldOpsEvidenceKind =
  | "storefront"
  | "interior"
  | "owner_consent"
  | "other";

export type FieldOpsReviewDecision = "verified" | "needs_changes" | "rejected";

/** An existing listing that looks like the business being onboarded. */
export type FieldOpsSimilarPlace = {
  id: string;
  name: string;
  slug: string;
  status: string;
  distanceM: number;
  /** pg_trgm name similarity, 0..1. */
  similarity: number;
  phoneMatch: boolean;
  /** 0..1, from @abonten/core/fieldOps/duplicateScore. */
  score: number;
  strong: boolean;
  createdAt: string;
};

/** One onboarding as members, leads and admins see it (PII masked). */
export type FieldOpsOnboarding = {
  id: string;
  campaignId: string;
  teamId: string;
  memberId: string;
  memberUserId: string;
  memberName: string | null;
  assignmentId: string | null;
  territoryId: string | null;
  territoryName: string | null;
  prospectId: string | null;
  mode: FieldOpsAssignmentMode;
  kind: "place" | "event";
  activityKey: FieldOpsActivityKey | null;
  businessName: string | null;
  businessPhoneMasked: string | null;
  ownerFullName: string | null;
  ownerPhoneMasked: string | null;
  ownerVerified: boolean;
  ownerIsNewAccount: boolean | null;
  ownerPriorPlaces: number;
  ownerPriorEvents: number;
  placeId: string | null;
  placeSlug: string | null;
  placeName: string | null;
  placeStatus: string | null;
  /** Phase 5: the event onboarded, when `kind` is "event". */
  eventId: string | null;
  eventSlug: string | null;
  eventTitle: string | null;
  eventStartsAt: string | null;
  /** Phase 5: the claim filed for the owner, when this is claim assistance. */
  claimRequestId: string | null;
  claimStatus: "pending" | "approved" | "rejected" | null;
  entityCreatedAt: string | null;
  submissionLocation: { lat: number; lng: number } | null;
  submissionAccuracyM: number | null;
  submissionDistanceM: number | null;
  insideTerritory: boolean | null;
  similarMatches: FieldOpsSimilarPlace[];
  duplicateAcknowledged: boolean;
  status: FieldOpsOnboardingStatus;
  submittedAt: string | null;
  resubmissionCount: number;
  reviewedAt: string | null;
  reviewDecision: FieldOpsReviewDecision | null;
  reviewNote: string | null;
  holdingUntil: string | null;
  flags: string[];
  succeededAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FieldOpsOnboardingEvidence = {
  id: string;
  kind: FieldOpsEvidenceKind;
  /** Short-lived signed URL, or null when the object hasn't been uploaded. */
  url: string | null;
  capturedAt: string | null;
  capturedLocation: { lat: number; lng: number } | null;
  accuracyM: number | null;
  uploadedAt: string | null;
  createdAt: string;
};

export type FieldOpsOnboardingEvent = {
  id: number;
  fromStatus: string | null;
  toStatus: string;
  actorKind: "member" | "lead" | "admin" | "system";
  actorName: string | null;
  note: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

/** One line of the eligibility checklist (lead review now, sweep later). */
export type FieldOpsEligibilityCheck = {
  key: string;
  label: string;
  /** null = can't be evaluated yet (e.g. holding period not started). */
  ok: boolean | null;
  severity: "hard" | "soft" | "info";
  detail: string | null;
};

export type FieldOpsOnboardingDetail = {
  onboarding: FieldOpsOnboarding;
  evidence: FieldOpsOnboardingEvidence[];
  timeline: FieldOpsOnboardingEvent[];
  place: {
    id: string;
    name: string;
    slug: string;
    status: string;
    description: string;
    categoryName: string | null;
    address: string | null;
    location: { lat: number; lng: number } | null;
    coverPublicId: string;
    coverVersion: string;
    photoCount: number;
    hasOpeningHours: boolean;
    hasContact: boolean;
    ownerMatches: boolean;
  } | null;
  checks: FieldOpsEligibilityCheck[];
  /** The rule that would pay this onboarding right now, if one is live. */
  rule: {
    id: string;
    amountMinor: number;
    currency: string;
    holdingDays: number;
  } | null;
};

/** What the wizard needs to resume: the row plus what's already done. */
export type FieldOpsOnboardingDraft = {
  onboarding: FieldOpsOnboarding;
  evidence: FieldOpsOnboardingEvidence[];
  ownerOtp: {
    /** Seconds until another code may be sent (0 = now). */
    resendInSeconds: number;
    /** Online mode: the link the owner opens to enter the code themselves. */
    consentPath: string | null;
  };
  /** The programme's duplicate-search thresholds (for the UI copy). */
  duplicateRadiusM: number;
};

export type FieldOpsEvidenceUploadTicket = {
  evidenceId: string;
  bucket: string;
  path: string;
  /** Token for supabase.storage.from(bucket).uploadToSignedUrl(path, token, file). */
  token: string;
};

/** What the public consent page shows the owner (no member/campaign PII). */
export type FieldOpsConsentView = {
  businessName: string | null;
  ownerPhoneMasked: string | null;
  verified: boolean;
  expired: boolean;
};

/** A territory as a member sees it, with their own assignments and prospects there. */
export type FieldOpsTerritoryView = {
  territory: FieldOpsTerritory;
  campaign: FieldOpsCampaignSummary;
  myAssignments: FieldOpsAssignment[];
  prospects: FieldOpsProspect[];
  /** Whether the caller may add prospects here right now. */
  canAddProspects: boolean;
};

// ── Phase 3: commissions, earnings, the sweep ───────────────

export type FieldOpsCommissionStatus =
  | "pending"
  | "approved"
  | "in_payout"
  | "paid"
  | "rejected"
  | "reversed";

/**
 * One earned commission, or (when `reversesCommissionId` is set) the negative
 * offset that takes back money already paid out. Amounts are minor units.
 */
export type FieldOpsCommission = {
  id: string;
  campaignId: string;
  teamId: string;
  memberId: string;
  memberUserId: string;
  memberName: string | null;
  onboardingId: string | null;
  /** The business the commission was earned on, when there is one. */
  businessName: string | null;
  activityKey: FieldOpsActivityKey;
  /** The version of the rule the amount was frozen from. */
  ruleVersion: number | null;
  amountMinor: number;
  currency: string;
  status: FieldOpsCommissionStatus;
  reversesCommissionId: string | null;
  earnedAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
  createdAt: string;
};

export type FieldOpsCommissionEvent = {
  id: number;
  fromStatus: string | null;
  toStatus: string;
  actorKind: "system" | "lead" | "admin";
  actorName: string | null;
  reason: string | null;
  createdAt: string;
};

/** Money totals in minor units for one member or one campaign. */
export type FieldOpsEarningsTotals = {
  /** Verified, inside the holding period. */
  pendingMinor: number;
  /** Confirmed by the sweep and waiting for a payout batch. */
  approvedMinor: number;
  /** In a payout batch that has not been paid yet (Phase 4). */
  inPayoutMinor: number;
  /** Paid out, net of reversal offsets. */
  paidMinor: number;
  currency: string;
};

export type FieldOpsMyEarnings = {
  campaign: FieldOpsCampaignSummary;
  totals: FieldOpsEarningsTotals;
  commissions: FieldOpsCommission[];
  /** Payments the office has sent or is preparing (Phase 4). */
  payouts: FieldOpsMyPayout[];
  /** The soonest holding period still running, if any. */
  nextReleaseAt: string | null;
  /** The live rate for this member's own activity, for "you earn X" copy. */
  liveRate: { amountMinor: number; currency: string } | null;
};

/** One flagged onboarding waiting for an admin decision. */
export type FieldOpsFlaggedOnboarding = {
  onboarding: FieldOpsOnboarding;
  commission: FieldOpsCommission | null;
  /** Why the sweep flagged it: check keys plus `spot_check` / `no_rule`. */
  flags: string[];
  flagDetails: Record<string, unknown>;
};

export type FieldOpsCommissionDetail = {
  commission: FieldOpsCommission;
  timeline: FieldOpsCommissionEvent[];
};

export type FieldOpsHealth = {
  enabled: boolean;
  sweepLagSeconds: number;
  sweepFailures: number;
  dueNotSwept: number;
  stuckReviews: number;
  staleFlags: number;
  succeededWithoutCommission: number;
  approvedWithoutRule: number;
  pendingMinor: number;
  approvedMinor: number;
};

// ── Phase 4: payouts ────────────────────────────────────────

export type FieldOpsPayoutBatchStatus =
  | "draft"
  | "approved"
  | "paid"
  | "cancelled";

export type FieldOpsPayoutBatch = {
  id: string;
  campaignId: string;
  campaignName: string;
  label: string;
  currency: string;
  status: FieldOpsPayoutBatchStatus;
  totalMinor: number;
  itemCount: number;
  paymentMethod: "momo_manual" | "bank_manual" | "paystack_transfer";
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FieldOpsPayoutItem = {
  id: string;
  batchId: string;
  memberId: string;
  memberUserId: string;
  memberName: string | null;
  amountMinor: number;
  currency: string;
  commissionCount: number;
  destination: {
    network: string | null;
    holderName: string | null;
    numberMasked: string | null;
    /** Full number: only for an admin with users.view_pii, else null. */
    number: string | null;
  };
  status: "pending" | "paid" | "failed";
  paymentReference: string | null;
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type FieldOpsPayoutBatchDetail = {
  batch: FieldOpsPayoutBatch;
  items: FieldOpsPayoutItem[];
  /** False when the viewer built this batch — a second admin must approve. */
  canApprove: boolean;
};

/** Where a member's own earnings are sent. Never carries the full number. */
export type FieldOpsPayoutDestination = {
  numberMasked: string | null;
  network: string | null;
  holderName: string | null;
  updatedAt: string | null;
};

/** One line of a member's own payout history. */
export type FieldOpsMyPayout = {
  id: string;
  batchLabel: string | null;
  amountMinor: number;
  currency: string;
  commissionCount: number;
  status: "pending" | "paid" | "failed";
  paymentReference: string | null;
  paidAt: string | null;
  createdAt: string;
};

// ── Phase 6: the content creator ────────────────────────────

export type FieldOpsContentPlatform =
  | "tiktok"
  | "instagram"
  | "facebook"
  | "x"
  | "youtube"
  | "whatsapp"
  | "other";

export type FieldOpsContentBrief = {
  id: string;
  campaignId: string;
  title: string;
  description: string | null;
  platforms: string[];
  assignedMemberId: string | null;
  assignedMemberName: string | null;
  dueOn: string | null;
  status: "open" | "closed";
  /** How many deliverables have been sent against this brief. */
  submissionCount: number;
  createdAt: string;
};

export type FieldOpsContentSubmission = {
  id: string;
  campaignId: string;
  briefId: string | null;
  briefTitle: string | null;
  memberId: string;
  memberUserId: string;
  memberName: string | null;
  platform: FieldOpsContentPlatform;
  url: string;
  caption: string | null;
  postedAt: string | null;
  /** Whatever the platform showed the creator. Never paid on. */
  selfReportedMetrics: { views?: number; likes?: number; shares?: number };
  status: "submitted" | "approved" | "rejected";
  reviewedAt: string | null;
  reviewNote: string | null;
  holdingUntil: string | null;
  createdAt: string;
};

/** Everything the /field/content screen needs in one call. */
export type FieldOpsMyContent = {
  campaign: FieldOpsCampaignSummary;
  briefs: FieldOpsContentBrief[];
  submissions: FieldOpsContentSubmission[];
  /** The live rate per approved deliverable, for the "you earn X" line. */
  liveRate: { amountMinor: number; currency: string } | null;
  /** False for anyone who is not the campaign's content creator. */
  canSubmit: boolean;
};
