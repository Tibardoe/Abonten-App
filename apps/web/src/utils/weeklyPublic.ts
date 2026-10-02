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
  async (scope: string | null, week: string | null) => {
    const result = await getWeeklyEditionCore(
      getSupabaseServiceClient(),
      null,
      {
        scope: scope ?? undefined,
        week: week ?? undefined,
      },
    );
    // These pages are rebuilt every minute. An edition that could not be
    // read must not be rendered as "nothing published" (and marked noindex)
    // for the next minute: thrown, the rebuild fails and the copy people
    // are being served stays up.
    if (result.status >= 500) {
      throw new Error(`weekly edition read failed (${result.status})`);
    }
    return result;
  },
);

export const getWeeklyPreview = cache(async (token: string) =>
  getWeeklyPreviewCore(getSupabaseServiceClient(), token),
);
