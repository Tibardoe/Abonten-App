export const dynamic = "force-dynamic";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components

import { cleanupOrphanedDraftAssets } from "@/actions/cleanupOrphanedDraftAssets";
import { getEventDrafts } from "@/actions/getEventDrafts";
import { getPlaceDrafts } from "@/actions/getPlaceDrafts";
import { getReviewDrafts } from "@/actions/getReviewDrafts";
import DraftsView from "@/components/organisms/DraftsView";

export default async function DraftsPage() {
  // Best-effort opportunistic sweep of Cloudinary assets queued by expired
  // drafts (see the drafts migrations) -- pg_cron can delete the expired
  // rows themselves, but not call Cloudinary directly. Never blocks the
  // page on failure.
  const [eventDrafts, reviewDrafts, placeDrafts] = await Promise.all([
    getEventDrafts(),
    getReviewDrafts(),
    getPlaceDrafts(),
    cleanupOrphanedDraftAssets().catch(() => null),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Drafts</h1>

      <DraftsView
        initialEventDrafts={eventDrafts.data}
        initialReviewDrafts={reviewDrafts.data}
        initialPlaceDrafts={placeDrafts.data}
      />
    </div>
  );
}
