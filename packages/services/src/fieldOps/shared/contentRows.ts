import type {
  FieldOpsContentBrief,
  FieldOpsContentPlatform,
  FieldOpsContentSubmission,
} from "@abonten/types/fieldOps";

// Row shapes and mappers for the content brief / submission pair. The
// engagement numbers are carried through exactly as the creator typed them
// and are labelled self-reported everywhere they are shown — nothing is
// paid on them.

export type BriefRow = {
  id: string;
  campaign_id: string;
  title: string;
  description: string | null;
  platforms: string[] | null;
  assigned_member_id: string | null;
  due_on: string | null;
  status: string;
  created_at: string;
  fieldops_team_member?: { full_name_snapshot: string | null } | null;
  fieldops_content_submission?: { count: number }[];
};

export const BRIEF_COLUMNS =
  "id, campaign_id, title, description, platforms, assigned_member_id, due_on, status, created_at, fieldops_team_member(full_name_snapshot), fieldops_content_submission(count)";

export function mapBrief(r: BriefRow): FieldOpsContentBrief {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    title: r.title,
    description: r.description,
    platforms: r.platforms ?? [],
    assignedMemberId: r.assigned_member_id,
    assignedMemberName: r.fieldops_team_member?.full_name_snapshot ?? null,
    dueOn: r.due_on,
    status: r.status as FieldOpsContentBrief["status"],
    submissionCount: Number(r.fieldops_content_submission?.[0]?.count ?? 0),
    createdAt: r.created_at,
  };
}

export type ContentSubmissionRow = {
  id: string;
  campaign_id: string;
  brief_id: string | null;
  member_id: string;
  member_user_id: string;
  platform: string;
  url: string;
  caption: string | null;
  posted_at: string | null;
  self_reported_metrics: unknown;
  status: string;
  reviewed_at: string | null;
  review_note: string | null;
  holding_until: string | null;
  created_at: string;
  fieldops_team_member?: { full_name_snapshot: string | null } | null;
  fieldops_content_brief?: { title: string } | null;
};

export const CONTENT_SUBMISSION_COLUMNS =
  "id, campaign_id, brief_id, member_id, member_user_id, platform, url, caption, posted_at, self_reported_metrics, status, reviewed_at, review_note, holding_until, created_at, fieldops_team_member(full_name_snapshot), fieldops_content_brief(title)";

export function mapContentSubmission(
  r: ContentSubmissionRow,
): FieldOpsContentSubmission {
  const m = (r.self_reported_metrics ?? {}) as Record<string, unknown>;
  const n = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  return {
    id: r.id,
    campaignId: r.campaign_id,
    briefId: r.brief_id,
    briefTitle: r.fieldops_content_brief?.title ?? null,
    memberId: r.member_id,
    memberUserId: r.member_user_id,
    memberName: r.fieldops_team_member?.full_name_snapshot ?? null,
    platform: r.platform as FieldOpsContentPlatform,
    url: r.url,
    caption: r.caption,
    postedAt: r.posted_at,
    selfReportedMetrics: {
      views: n(m.views),
      likes: n(m.likes),
      shares: n(m.shares),
    },
    status: r.status as FieldOpsContentSubmission["status"],
    reviewedAt: r.reviewed_at,
    reviewNote: r.review_note,
    holdingUntil: r.holding_until,
    createdAt: r.created_at,
  };
}
