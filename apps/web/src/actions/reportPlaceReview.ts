"use server";

import { createClient } from "@/config/supabase/server";
import { submitReportCore } from "@abonten/services/reports/submitReportCore";
import type { ReportCategory } from "@abonten/types/adminTypes";

// Kept for backward compatibility. Delegates to the generic reporting
// pipeline with target_type = 'place_review'. See reportPlace.ts.
const KNOWN: ReportCategory[] = [
  "spam",
  "fraud_scam",
  "misleading",
  "harassment",
  "inappropriate",
  "fake_listing",
  "safety",
  "copyright",
  "impersonation",
  "other",
];

export async function reportPlaceReview(reviewId: string, reason: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  const category = (
    KNOWN.includes(reason as ReportCategory)
      ? (reason as ReportCategory)
      : "other"
  ) as ReportCategory;

  const result = await submitReportCore(supabase, user.id, {
    targetType: "place_review",
    targetId: reviewId,
    category,
    details: KNOWN.includes(reason as ReportCategory) ? null : reason,
    source: "web",
  });
  return { status: result.status, message: result.message };
}
