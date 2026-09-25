import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadContentCampaign } from "@/lib/data";
import { formatOpsDateTime } from "@/lib/format";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import { formatMinor } from "@abonten/core/content/campaignMoney";
import {
  CAMPAIGN_OBJECTIVE_LABEL,
  CAMPAIGN_STATUS_LABEL,
  PROMOTION_END_REASON_LABEL,
} from "@abonten/core/content/copy";
import { formatReachRange } from "@abonten/core/content/promotionEstimate";
import { formatMoney } from "@abonten/core/formatMoney";
import Link from "next/link";
import { SpotlightTabs } from "../../SpotlightTabs";
import { campaignTone } from "../campaignTone";
import { CampaignReviewPanel } from "./CampaignReviewPanel";

export default async function SpotlightCampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermissionPage("spotlight.view");
  const { id } = await params;
  const { ctx, detail } = await loadContentCampaign(id);
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;

  if (detail.status !== 200 || !detail.data) {
    return (
      <div>
        <PageHeader title="Promotion" />
        <SpotlightTabs active="/spotlight/campaigns" />
        <EmptyState>{detail.message ?? "Promotion not found."}</EmptyState>
      </div>
    );
  }

  const { campaign: c, events, ledger, transaction } = detail.data;

  const facts: [string, React.ReactNode][] = [
    [
      "Status",
      <Badge key="s" tone={campaignTone(c.status)}>
        {CAMPAIGN_STATUS_LABEL[c.status]}
      </Badge>,
    ],
    ["Goal", CAMPAIGN_OBJECTIVE_LABEL[c.objective]],
    [
      "Budget",
      `${formatMinor(c.budgetMinor, c.currency)} · up to ${c.durationDays} days`,
    ],
    [
      "Runs",
      `${formatOpsDateTime(c.startsAt)} → ${formatOpsDateTime(c.endsAt)}`,
    ],
    [
      "Priced at",
      `${formatMinor(c.cpmMinor, c.currency)} per 1,000 · pricing v${c.pricingVersion}`,
    ],
    ["Paid", formatMinor(c.paidMinor, c.currency)],
    ["Delivered (spent)", formatMinor(c.spentMinor, c.currency)],
    ["Refunded", formatMinor(c.refundedMinor, c.currency)],
    ["Refundable now", formatMinor(c.refundableMinor, c.currency)],
    ["Ended", c.endReason ? PROMOTION_END_REASON_LABEL[c.endReason] : "—"],
  ];
  const m = c.metrics;
  const n = (v: number | undefined) => (v ?? 0).toLocaleString("en-GB");
  // Reach = distinct devices shown the promotion; impressions = times shown.
  const delivery: [string, string][] = [
    [
      "Estimated reach (sold)",
      `${formatReachRange({ reachLow: c.estimatedReachLow, reachHigh: c.estimatedReachHigh })} · ${c.estimateBasis}`,
    ],
    ["Reach", n(m?.reach ?? c.reach)],
    [
      "Impressions",
      `${n(m?.impressions ?? c.impressions)} / ${n(c.impressionGoal)} (${((m?.deliveryBps ?? 0) / 100).toFixed(1)} %)`,
    ],
    ["Meaningful views", n(m?.meaningfulViews ?? c.views)],
    ["Completions", n(m?.completions ?? c.completions)],
    ["Profile taps", n(m?.clicks.profile)],
    ["Event taps", n(m?.clicks.event)],
    ["Place taps", n(m?.clicks.place)],
    ["Button taps", n(m?.clicks.cta)],
    ["Follows after seeing it", n(m?.follows)],
    ["Ticket purchases", n(m?.conversions.ticketPurchases)],
    ["Reservations", n(m?.conversions.reservations)],
  ];

  return (
    <div>
      <PageHeader
        title="Spotlight promotion"
        description={
          <>
            By{" "}
            <Link href={`/users/${c.advertiserId}`} className="hover:underline">
              {c.advertiser?.username ??
                c.advertiser?.fullName ??
                c.advertiserId}
            </Link>{" "}
            · version {c.version}
          </>
        }
      />
      <SpotlightTabs active="/spotlight/campaigns" />

      <div className="grid gap-4 lg:grid-cols-[1fr,360px]">
        <div className="space-y-4">
          <Card className="grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-3">
            {facts.map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <div className="font-medium">{value}</div>
              </div>
            ))}
          </Card>

          <Card className="space-y-2 p-4 text-sm">
            <p className="font-semibold">Delivery</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {delivery.map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-medium tabular-nums">{value}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-1 p-4 text-sm">
            <p className="font-semibold">Spotlight</p>
            <p className="line-clamp-3">
              {c.post?.caption?.trim() || "No caption"}
            </p>
            <Link
              href={`/spotlight/posts/${c.postId}`}
              className="text-primary hover:underline"
            >
              Open the post to check it
            </Link>
            {c.reviewReason ? (
              <p className="text-muted-foreground">
                Review note: {c.reviewReason}
              </p>
            ) : null}
            {c.pauseReason ? (
              <p className="text-muted-foreground">
                Paused by {c.pauseSource}: {c.pauseReason}
              </p>
            ) : null}
          </Card>

          <Card className="space-y-1 p-4 text-sm">
            <p className="font-semibold">Payment</p>
            {transaction ? (
              <>
                <p>
                  Transaction{" "}
                  <Link
                    href={`/finance/transactions/${transaction.id}`}
                    className="text-primary hover:underline"
                  >
                    {transaction.id.slice(0, 8)}…
                  </Link>{" "}
                  · {transaction.status} ·{" "}
                  {formatMoney(transaction.currency, transaction.amount)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Provider reference {transaction.providerReference ?? "—"}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">No payment recorded yet.</p>
            )}
          </Card>

          <section className="space-y-2">
            <p className="text-sm font-semibold">Ledger</p>
            {ledger.length === 0 ? (
              <EmptyState>No ledger entries yet.</EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>Entry</Th>
                    <Th>Amount</Th>
                    <Th>Note</Th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((l) => (
                    <tr key={l.id}>
                      <Td className="text-xs">
                        {formatOpsDateTime(l.createdAt)}
                      </Td>
                      <Td>{l.entryType}</Td>
                      <Td className="tabular-nums">
                        {formatMinor(l.amountMinor, l.currency)}
                      </Td>
                      <Td className="text-xs text-muted-foreground">
                        {l.note ?? ""}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </section>

          <section className="space-y-2">
            <p className="text-sm font-semibold">History</p>
            <ol className="space-y-2 border-l border-border pl-4 text-sm">
              {events.map((e) => (
                <li key={e.id}>
                  <span className="font-medium">
                    {e.fromStatus ?? "new"} → {e.toStatus}
                  </span>{" "}
                  <span className="text-xs text-muted-foreground">
                    by {e.actorKind} · {formatOpsDateTime(e.createdAt)}
                  </span>
                  {e.reason ? (
                    <p className="text-xs text-muted-foreground">{e.reason}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <CampaignReviewPanel
          campaign={c}
          permissions={ctx.permissions}
          stepUpFresh={stepUpFresh}
        />
      </div>
    </div>
  );
}
