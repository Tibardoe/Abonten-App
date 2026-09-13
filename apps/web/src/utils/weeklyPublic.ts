import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import { getWeeklyEditionCore } from "@abonten/services/weekly/weeklyEditionCore";
import { getWeeklyPreviewCore } from "@abonten/services/weekly/weeklyPreview";
import { cache } from "react";

// Server-only reads for the Abonten Weekly pages. These deliberately resolve
// the programme for an anonymous visitor and never touch cookies or headers,
// so /weekly pages stay cacheable (revalidate = 60) and identical for
// everyone. While the audience is staff or beta, the anonymous answer carries
// no edition and the page loads it client-side for the signed-in visitor.
//
// React cache() lets generateMetadata and the page share one database call
// per request.

export const getPublicWeeklyEdition = cache(
  async (scope: string | null, week: string | null) =>
    getWeeklyEditionCore(getSupabaseServiceClient(), null, {
      scope: scope ?? undefined,
      week: week ?? undefined,
    }),
);

export const getWeeklyPreview = cache(async (token: string) =>
  getWeeklyPreviewCore(getSupabaseServiceClient(), token),
);
