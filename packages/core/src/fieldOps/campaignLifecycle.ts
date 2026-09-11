import type {
  FieldOpsCampaignAction,
  FieldOpsCampaignStatus,
} from "@abonten/types/fieldOps";

// The Field Ops campaign state machine, as a pure function so the admin UI
// can show only the moves that exist and unit tests can pin the table down.
// The SQL function fieldops_set_campaign_status is the authority and holds
// the same table; if they ever disagree the database wins.
//
//   draft ─activate─► active ─pause─► paused ─resume─► active
//                       │                 │
//                       └─wind_down─► winding_down ─complete─► completed ─archive─► archived
//   draft ─archive─► archived (a plan that never ran)
//   paused ─wind_down / complete─► (a paused campaign that never resumes)

const TRANSITIONS: Record<
  FieldOpsCampaignStatus,
  Partial<Record<FieldOpsCampaignAction, FieldOpsCampaignStatus>>
> = {
  draft: { activate: "active", archive: "archived" },
  active: { pause: "paused", wind_down: "winding_down" },
  paused: {
    resume: "active",
    wind_down: "winding_down",
    complete: "completed",
  },
  winding_down: { complete: "completed" },
  completed: { archive: "archived" },
  archived: {},
};

export const CAMPAIGN_ACTION_LABEL: Record<FieldOpsCampaignAction, string> = {
  activate: "Activate",
  pause: "Pause",
  resume: "Resume",
  wind_down: "Start winding down",
  complete: "Complete",
  archive: "Archive",
};

export const CAMPAIGN_STATUS_LABEL: Record<FieldOpsCampaignStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  winding_down: "Winding down",
  completed: "Completed",
  archived: "Archived",
};

/** The status an action leads to from `current`, or null if not allowed. */
export function nextCampaignStatus(
  current: FieldOpsCampaignStatus,
  action: FieldOpsCampaignAction,
): FieldOpsCampaignStatus | null {
  return TRANSITIONS[current]?.[action] ?? null;
}

/** Every action available from `current`, in display order. */
export function availableCampaignActions(
  current: FieldOpsCampaignStatus,
): FieldOpsCampaignAction[] {
  const order: FieldOpsCampaignAction[] = [
    "activate",
    "resume",
    "pause",
    "wind_down",
    "complete",
    "archive",
  ];
  return order.filter((a) => TRANSITIONS[current]?.[a] !== undefined);
}

/** Campaigns in these states count as "live" (one per region at a time). */
export const LIVE_CAMPAIGN_STATUSES: FieldOpsCampaignStatus[] = [
  "active",
  "paused",
  "winding_down",
];

export function isLiveCampaignStatus(status: FieldOpsCampaignStatus): boolean {
  return LIVE_CAMPAIGN_STATUSES.includes(status);
}

/** What each state allows. Mirrors the lifecycle table in the plan. */
export type CampaignCapabilities = {
  newAssignments: boolean;
  newSubmissions: boolean;
  resubmissions: boolean;
  reviews: boolean;
  commissionGeneration: boolean;
  payouts: boolean;
  workerUi: boolean;
};

export function campaignCapabilities(
  status: FieldOpsCampaignStatus,
): CampaignCapabilities {
  switch (status) {
    case "draft":
      return {
        newAssignments: true,
        newSubmissions: false,
        resubmissions: false,
        reviews: false,
        commissionGeneration: false,
        payouts: false,
        workerUi: false,
      };
    case "active":
      return {
        newAssignments: true,
        newSubmissions: true,
        resubmissions: true,
        reviews: true,
        commissionGeneration: true,
        payouts: true,
        workerUi: true,
      };
    case "paused":
      return {
        newAssignments: false,
        newSubmissions: false,
        resubmissions: false,
        reviews: true,
        commissionGeneration: false,
        payouts: true,
        workerUi: true,
      };
    case "winding_down":
      return {
        newAssignments: false,
        newSubmissions: false,
        resubmissions: true,
        reviews: true,
        commissionGeneration: true,
        payouts: true,
        workerUi: true,
      };
    case "completed":
      return {
        newAssignments: false,
        newSubmissions: false,
        resubmissions: false,
        reviews: false,
        commissionGeneration: true,
        payouts: true,
        workerUi: true,
      };
    case "archived":
      return {
        newAssignments: false,
        newSubmissions: false,
        resubmissions: false,
        reviews: false,
        commissionGeneration: false,
        payouts: false,
        workerUi: true,
      };
  }
}

/** A URL-safe slug for a campaign name, e.g. "Ashanti 2026 Q4" → "ashanti-2026-q4". */
export function campaignSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
