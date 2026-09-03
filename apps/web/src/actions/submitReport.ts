"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import { submitReportCore } from "@abonten/services/reports/submitReportCore";
import type {
  ReportCategory,
  ReportTargetType,
} from "@abonten/types/adminTypes";
import { submitReportSchema } from "@abonten/validation/reportSchema";

// Thin web transport for the user-facing "Report this content" flow. The
// reporter identity comes from the cookie session here and is passed to
// submitReportCore, which ignores anything the client says about who is
// reporting (spec §5). Shares its body verbatim with
// POST /api/mobile/reports.
export async function submitReport(input: {
  targetType: ReportTargetType;
  targetId: string;
  category: ReportCategory;
  details?: string | null;
  attachment?: {
    storagePath: string;
    fileName: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
  } | null;
}) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "Please sign in to report content." };
  }

  const parsed = submitReportSchema.safeParse({
    targetType: input.targetType,
    targetId: input.targetId,
    category: input.category,
    details: input.details ?? "",
    attachment: input.attachment ?? null,
  });
  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Please check your report.",
    };
  }

  try {
    return await submitReportCore(supabase, user.id, {
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      category: parsed.data.category,
      details:
        typeof parsed.data.details === "string" ? parsed.data.details : null,
      source: "web",
      attachment: input.attachment ?? null,
    });
  } catch (error) {
    logger.error("submitReport failed", error);
    return {
      status: 500,
      message: "Couldn't submit your report. Please try again.",
    };
  }
}
