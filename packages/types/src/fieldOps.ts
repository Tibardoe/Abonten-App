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
};
