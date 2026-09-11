import { EmptyState, PageHeader } from "@/components/ui";
import { loadRewardQueue } from "@/lib/data";
import Link from "next/link";
import { RewardEventTable } from "../RewardEventTable";
import { RewardsTabs } from "../RewardsTabs";
import { HeldRewardDecision } from "./HeldRewardDecision";

export default async function RewardQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { ctx, events } = await loadRewardQueue(sp.cursor ?? null);
  const canReview = ctx.permissions.includes("rewards.review");

  return (
    <div>
      <PageHeader
        title="Review queue"
        description="Rewards the risk checks held. Nothing is paid until someone approves, and an approved reward still waits for the event to settle and is re-checked then. Users only ever see “under review”."
      />
      <RewardsTabs active="/rewards/queue" />
      {events.status !== 200 ? (
        <EmptyState>{events.message ?? "Couldn't load the queue."}</EmptyState>
      ) : events.data.length === 0 ? (
        <EmptyState>Nothing is waiting for review.</EmptyState>
      ) : (
        <>
          <RewardEventTable
            events={events.data}
            actions={(e) => (
              <HeldRewardDecision rewardEventId={e.id} canReview={canReview} />
            )}
          />
          {events.hasNextPage && events.nextCursor ? (
            <Link
              href={`/rewards/queue?cursor=${encodeURIComponent(events.nextCursor)}`}
              className="mt-3 inline-block text-sm text-primary hover:underline"
            >
              Older →
            </Link>
          ) : null}
        </>
      )}
    </div>
  );
}
