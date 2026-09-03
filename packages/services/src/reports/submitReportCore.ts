import { logger } from "@abonten/core/logger";
import {
  HIGH_PRIORITY_CATEGORIES,
  REPORTABLE_CATEGORIES,
  type ReportCategory,
  type ReportPriority,
  type ReportSource,
  type ReportTargetType,
} from "@abonten/types/adminTypes";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth body of the user-facing "Report this content" action. Shared
// verbatim by the web submitReport Server Action and the mobile
// POST /api/mobile/reports route. Runs on the CALLER's own session client
// (RLS: report_reporter_insert with reporter_id = auth.uid()) — never the
// service role.
//
// Security (spec §5):
//   * reporter_id is set from `userId` here, ignoring anything the client
//     sent about who is reporting.
//   * the target must exist and be of a reportable kind.
//   * you cannot report your own account / profile.
//   * a partial unique index (idx_report_one_open_per_reporter_target)
//     stops a 2nd OPEN report on the same target by the same user; we
//     pre-check for a friendly message and rely on the index as the race-safe
//     backstop.
//   * a soft rate cap (MAX_REPORTS_PER_HOUR) blunts bulk abuse without
//     blocking distinct legitimate reports.

export type SubmitReportCoreInput = {
  targetType: ReportTargetType;
  targetId: string;
  category: ReportCategory;
  details?: string | null;
  source: ReportSource;
  attachment?: {
    storagePath: string;
    fileName: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
  } | null;
};

export type SubmitReportResult = {
  status: 200 | 400 | 401 | 404 | 409 | 429 | 500;
  message: string;
  data?: { reportId: string };
};

const MAX_REPORTS_PER_HOUR = 10;

const TARGET_TABLE: Record<
  ReportTargetType,
  { table: string; idColumn: string }
> = {
  event: { table: "event", idColumn: "id" },
  place: { table: "place", idColumn: "id" },
  event_review: { table: "event_review", idColumn: "id" },
  place_review: { table: "place_review", idColumn: "id" },
  user_review: { table: "review", idColumn: "id" },
  user: { table: "user_info", idColumn: "id" },
  organizer: { table: "user_info", idColumn: "id" },
  highlight: { table: "highlight", idColumn: "id" },
};

function seedPriority(category: ReportCategory): ReportPriority {
  return HIGH_PRIORITY_CATEGORIES.includes(category) ? "high" : "normal";
}

export async function submitReportCore(
  supabase: SupabaseClient,
  userId: string,
  input: SubmitReportCoreInput,
): Promise<SubmitReportResult> {
  const { targetType, targetId, category } = input;

  // 1. category must be valid for this target type
  const allowed = REPORTABLE_CATEGORIES[targetType];
  if (!allowed || !allowed.includes(category)) {
    return {
      status: 400,
      message: "That reason doesn't apply to this content.",
    };
  }

  // 2. can't report yourself
  if (
    (targetType === "user" || targetType === "organizer") &&
    targetId === userId
  ) {
    return { status: 400, message: "You can't report your own account." };
  }

  // 3. target must exist
  const map = TARGET_TABLE[targetType];
  const { data: targetRow, error: targetErr } = await supabase
    .from(map.table)
    .select(map.idColumn)
    .eq(map.idColumn, targetId)
    .maybeSingle();

  if (targetErr) {
    logger.error(
      `submitReportCore: target lookup failed: ${targetErr.message}`,
    );
    return { status: 500, message: "Something went wrong. Please try again." };
  }
  if (!targetRow) {
    return { status: 404, message: "That content no longer exists." };
  }

  // 4. soft rate cap
  const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentCount, error: countErr } = await supabase
    .from("report")
    .select("id", { count: "exact", head: true })
    .eq("reporter_id", userId)
    .gte("created_at", sinceIso);

  if (countErr) {
    logger.error(`submitReportCore: rate check failed: ${countErr.message}`);
  } else if ((recentCount ?? 0) >= MAX_REPORTS_PER_HOUR) {
    return {
      status: 429,
      message:
        "You've submitted a lot of reports recently. Please try again later.",
    };
  }

  // 5. dedupe — friendly pre-check (index is the race-safe backstop)
  const dedupeKey = `${targetType}:${targetId}`;
  const { data: existingOpen } = await supabase
    .from("report")
    .select("id")
    .eq("reporter_id", userId)
    .eq("dedupe_key", dedupeKey)
    .in("status", ["new", "under_review", "awaiting_info"])
    .maybeSingle();

  if (existingOpen) {
    return {
      status: 409,
      message: "You've already reported this. Our team is reviewing it.",
    };
  }

  // 6. insert
  const details =
    typeof input.details === "string" && input.details.trim().length > 0
      ? input.details.trim().slice(0, 2000)
      : null;

  const { data: inserted, error: insertErr } = await supabase
    .from("report")
    .insert({
      reporter_id: userId,
      target_type: targetType,
      target_id: targetId,
      dedupe_key: dedupeKey,
      category,
      details,
      status: "new",
      priority: seedPriority(category),
      source: input.source,
    })
    .select("id")
    .single();

  if (insertErr) {
    // 23505 = unique_violation on the partial "one open report" index
    if (insertErr.code === "23505") {
      return {
        status: 409,
        message: "You've already reported this. Our team is reviewing it.",
      };
    }
    logger.error(`submitReportCore: insert failed: ${insertErr.message}`);
    return {
      status: 500,
      message: "Couldn't submit your report. Please try again.",
    };
  }

  // 7. optional attachment (already uploaded by the client under its own
  //    <userId>/... prefix; validate the prefix, record metadata)
  if (input.attachment?.storagePath) {
    if (!input.attachment.storagePath.startsWith(`${userId}/`)) {
      logger.warn(
        `submitReportCore: rejecting attachment path outside caller folder: ${input.attachment.storagePath}`,
      );
    } else {
      const { error: attErr } = await supabase
        .from("report_attachment")
        .insert({
          report_id: inserted.id,
          storage_path: input.attachment.storagePath,
          file_name: input.attachment.fileName,
          mime_type: input.attachment.mimeType,
          size_bytes: input.attachment.sizeBytes,
        });
      if (attErr) {
        logger.error(
          `submitReportCore: attachment insert failed (report kept): ${attErr.message}`,
        );
      }
    }
  }

  return {
    status: 200,
    message: "Report submitted. Thank you — our team will take a look.",
    data: { reportId: inserted.id },
  };
}
