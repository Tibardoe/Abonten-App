import { CurrencySwitcher } from "@/components/CurrencySwitcher";
import { RangePicker } from "@/components/metrics/RangePicker";
import { SectionHeading } from "@/components/metrics/SectionHeading";
import { EmptyState, PageHeader, Stat } from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadContentOverview } from "@/lib/data";
import { formatMinor } from "@abonten/core/content/campaignMoney";
import { SpotlightTabs } from "./SpotlightTabs";

// Admin › Spotlight & Stories: is short-form content being made, watched and
// kept safe, and are paid promotions healthy? Counts come from the hourly
// rollups (content_post_daily_stat) plus live tables for moderation and money,
// so view figures can lag by up to an hour.

function n(value: number): string {
  return value.toLocaleString("en-GB");
}

export default async function SpotlightOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermissionPage("spotlight.view");
  const sp = await searchParams;
  const { range, overview } = await loadContentOverview(sp);

  return (
    <div>
      <PageHeader
        title="Spotlight & Stories"
        description="Short videos, 24-hour Stories, follows and paid promotions."
        actions={<RangePicker basePath="/spotlight" range={range} />}
      />
      <SpotlightTabs active="/spotlight" />
      {overview.data ? (
        <CurrencySwitcher
          basePath="/spotlight"
          current={overview.data.campaigns.currency}
          currencies={overview.data.campaigns.currencies}
          params={sp}
        />
      ) : null}

      {overview.status !== 200 || !overview.data ? (
        <EmptyState>
          {overview.message ?? "Couldn't load the overview."}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <p className="text-xs text-muted-foreground">
            View counts update hourly. A view counts after two seconds of
            watching; repeat views by the same person are not double-counted.
          </p>

          <section className="space-y-2">
            <SectionHeading title="Spotlight" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat
                label="New posts"
                value={n(overview.data.spotlight.posts)}
              />
              <Stat
                label="Live posts"
                value={n(overview.data.spotlight.livePosts)}
              />
              <Stat
                label="Active creators"
                value={n(overview.data.spotlight.activeCreators)}
              />
              <Stat
                label="Impressions"
                value={n(overview.data.spotlight.impressions)}
              />
              <Stat
                label="Views"
                value={n(overview.data.spotlight.meaningfulViews)}
                hint="Two seconds or more"
              />
              <Stat
                label="Completions"
                value={n(overview.data.spotlight.completions)}
              />
              <Stat label="Likes" value={n(overview.data.spotlight.likes)} />
              <Stat
                label="Comments"
                value={n(overview.data.spotlight.comments)}
              />
              <Stat label="Shares" value={n(overview.data.spotlight.shares)} />
              <Stat label="Saves" value={n(overview.data.spotlight.saves)} />
              <Stat
                label="Event taps"
                value={n(overview.data.spotlight.eventClicks)}
              />
              <Stat
                label="Place taps"
                value={n(overview.data.spotlight.placeClicks)}
              />
              <Stat
                label="Profile taps"
                value={n(overview.data.spotlight.profileClicks)}
              />
              <Stat
                label="Attributed purchases"
                value={n(overview.data.spotlight.conversions)}
                hint="Within 7 days of a tap"
              />
            </div>
          </section>

          <section className="space-y-2">
            <SectionHeading title="Stories" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat
                label="New Stories"
                value={n(overview.data.stories.posts)}
              />
              <Stat label="Live now" value={n(overview.data.stories.live)} />
              <Stat
                label="Active publishers"
                value={n(overview.data.stories.activePublishers)}
              />
              <Stat
                label="Opened"
                value={n(overview.data.stories.viewStarts)}
              />
              <Stat
                label="Watched to the end"
                value={n(overview.data.stories.completions)}
              />
              <Stat
                label="Reactions"
                value={n(overview.data.stories.reactions)}
              />
              <Stat
                label="Comments"
                value={n(overview.data.stories.comments)}
              />
            </div>
          </section>

          <section className="space-y-2">
            <SectionHeading title="Follows and safety" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat
                label="New follows"
                value={n(overview.data.social.follows)}
              />
              <Stat
                label="All follows"
                value={n(overview.data.social.totalFollows)}
              />
              <Stat
                label="Open reports"
                value={n(overview.data.social.reportsOpen)}
                href="/reports"
                tone={
                  overview.data.social.reportsOpen > 0 ? "warning" : undefined
                }
              />
              <Stat
                label="Moderated"
                value={n(overview.data.social.moderated)}
                href="/spotlight/posts?state=hidden"
              />
            </div>
          </section>

          <section className="space-y-2">
            <SectionHeading title="Promotions" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat
                label="Waiting for review"
                value={n(overview.data.campaigns.pendingReview)}
                href="/spotlight/campaigns"
                tone={
                  overview.data.campaigns.pendingReview > 0
                    ? "warning"
                    : undefined
                }
              />
              <Stat label="Running" value={n(overview.data.campaigns.active)} />
              <Stat
                label="Started"
                value={n(overview.data.campaigns.created)}
              />
              <Stat
                label="Advertisers"
                value={n(overview.data.campaigns.advertisers)}
              />
              <Stat
                label="Paid"
                value={formatMinor(
                  overview.data.campaigns.paidMinor,
                  overview.data.campaigns.currency,
                )}
              />
              <Stat
                label="Delivered"
                value={formatMinor(
                  overview.data.campaigns.spentMinor,
                  overview.data.campaigns.currency,
                )}
                hint="Recognised per delivered sponsored impression"
              />
              <Stat
                label="Refunded"
                value={formatMinor(
                  overview.data.campaigns.refundedMinor,
                  overview.data.campaigns.currency,
                )}
              />
              <Stat
                label="Sponsored impressions"
                value={n(overview.data.campaigns.impressions)}
                hint="Times shown"
              />
              <Stat
                label="Reach"
                value={n(overview.data.campaigns.reach)}
                hint="Distinct devices, summed per promotion"
              />
              <Stat
                label="Unused budget to decide"
                value={formatMinor(
                  overview.data.campaigns.unusedToReviewMinor,
                  overview.data.campaigns.currency,
                )}
                hint="Completed or cancelled, not refunded"
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
