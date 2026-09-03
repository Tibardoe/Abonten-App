"use server";

import { createClient } from "@/config/supabase/server";
import { submitReportCore } from "@abonten/services/reports/submitReportCore";
import type { ReportCategory } from "@abonten/types/adminTypes";

// Kept for backward compatibility with existing callers. Now delegates to
// the generic reporting pipeline (submitReportCore) writing a `report` row
// with target_type = 'place'. `reason` is a free-text string from the old
// UI; map an unrecognised value to the 'other' category and keep the text
// as the details.
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

export async function reportPlace(placeId: string, reason: string) {
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
    targetType: "place",
    targetId: placeId,
    category,
    details: KNOWN.includes(reason as ReportCategory) ? null : reason,
    source: "web",
  });
  return { status: result.status, message: result.message };
}
