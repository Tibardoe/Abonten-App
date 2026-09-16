import {
  Badge,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  cn,
  timeAgo,
} from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadContentCampaigns } from "@/lib/data";
import { formatMinor } from "@abonten/core/content/campaignMoney";
import { CAMPAIGN_STATUS_LABEL } from "@abonten/core/content/copy";
import type { ContentCampaignStatus } from "@abonten/types/contentType";
import Link from "next/link";
import { SpotlightTabs } from "../SpotlightTabs";
import { campaignTone } from "./campaignTone";

const STATUSES = [
  "pending_review",
  "scheduled",
  "active",
  "paused",
  "completed",
  "rejected",
  "cancelled",
  "refunded",
  "any",
] as const;

type StatusKey = (typeof STATUSES)[number];

export default async function SpotlightCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cursor?: string }>;
}) {
  await requirePermissionPage("spotlight.view");
  const sp = await searchParams;
  const status: StatusKey = STATUSES.includes(sp.status as StatusKey)
    ? (sp.status as StatusKey)
    : "pending_review";
  const { list } = await loadContentCampaigns({
    status,
    cursor: sp.cursor ?? null,
  });

  return (
    <div>
      <PageHeader
        title="Spotlight & Stories"
        description="Paid Spotlight promotions. A paid promotion waits here until someone approves or rejects it; rejecting refunds it in full."
      />
      <SpotlightTabs active="/spotlight/campaigns" />

      <div className="mb-3 flex flex-wrap gap-1">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/spotlight/campaigns?status=${s}`}
            className={cn(
              "rounded px-2.5 py-1 text-xs",
              status === s
                ? "bg-primary text-primary-foreground"
                : "border border-border hover:bg-muted",
            )}
          >
            {s === "any" ? "Everything" : CAMPAIGN_STATUS_LABEL[s]}
          </Link>
        ))}
      </div>

      {list.status !== 200 || !list.data ? (
        <EmptyState>{list.message ?? "Couldn't load promotions."}</EmptyState>
      ) : list.data.rows.length === 0 ? (
        <EmptyState>No promotions in this state.</EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Spotlight</Th>
                <Th>Advertiser</Th>
                <Th>Status</Th>
                <Th>Budget</Th>
                <Th>Paid / delivered / refunded</Th>
                <Th>Delivery</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.rows.map((c) => (
                <tr key={c.id} className="hover:bg-muted/40">
                  <Td className="max-w-[280px]">
                    <Link
                      href={`/spotlight/campaigns/${c.id}`}
                      className="line-clamp-2 hover:underline"
                    >
                      {c.post?.caption?.trim() || "Spotlight"}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {c.id.slice(0, 8)}…
                    </div>
                  </Td>
                  <Td>
                    <Link
                      href={`/users/${c.advertiserId}`}
                      className="hover:underline"
                    >
                      {c.advertiser?.username ??
                        c.advertiser?.fullName ??
                        c.advertiserId.slice(0, 8)}
                    </Link>
                  </Td>
                  <Td>
                    <Badge tone={campaignTone(c.status)}>
                      {CAMPAIGN_STATUS_LABEL[c.status]}
                    </Badge>
                  </Td>
                  <Td className="text-xs">
                    {formatMinor(c.budgetMinor, c.currency)} · up to{" "}
                    {c.durationDays} days
                  </Td>
                  <Td className="text-xs tabular-nums">
                    {formatMinor(c.paidMinor, c.currency)} /{" "}
                    {formatMinor(c.spentMinor, c.currency)} /{" "}
                    {formatMinor(c.refundedMinor, c.currency)}
                  </Td>
                  <Td className="text-xs tabular-nums text-muted-foreground">
                    {c.reach.toLocaleString("en-GH")} reached ·{" "}
                    {c.impressions.toLocaleString("en-GH")} /{" "}
                    {c.impressionGoal.toLocaleString("en-GH")} impressions
                  </Td>
                  <Td className="text-xs text-muted-foreground">
                    {timeAgo(c.updatedAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {list.data.hasNextPage && list.data.nextCursor ? (
            <div className="mt-3 text-right">
              <Link
                href={`/spotlight/campaigns?status=${status}&cursor=${encodeURIComponent(list.data.nextCursor)}`}
                className="text-sm text-primary hover:underline"
              >
                Next page →
              </Link>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
