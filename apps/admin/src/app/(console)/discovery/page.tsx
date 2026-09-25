import { CapNotice } from "@/components/metrics/CapNotice";
import { MetricCard } from "@/components/metrics/MetricCard";
import { SectionHeading } from "@/components/metrics/SectionHeading";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  cn,
  timeAgo,
} from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadDiscoveryOverview } from "@/lib/data";
import { ratioState } from "@abonten/core/admin/smallSample";
import {
  type StatusFamily,
  statusLabel,
} from "@abonten/core/admin/statusLabels";
import Link from "next/link";
import { DiscoveryTabs } from "./DiscoveryTabs";

// Admin › Discovery: is search helping people find things, and are
// recommendation notices useful rather than noisy? Shadow-mode projections
// sit next to live numbers so the programme can be judged before any push
// goes out.
//
// The two SQL functions behind this page take a number of days, so the
// window is a rolling one ending now — not the console's calendar-day range.
// The caption says so rather than pretending otherwise.

const RANGES = [7, 14, 30, 90];
// Below this many searches a rate would be a coin toss.
const MIN_SEARCHES_FOR_A_RATE = 20;

function KeyValues({
  rows,
  family,
}: {
  rows: Record<string, number> | null | undefined;
  /** How to turn each key into a word an operator uses. */
  family: StatusFamily;
}) {
  const entries = Object.entries(rows ?? {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {entries.map(([k, v]) => (
        <li key={k} className="flex justify-between gap-4">
          <span className="text-muted-foreground">
            {statusLabel(family, k)}
          </span>
          <span className="tabular-nums">{v.toLocaleString("en-GB")}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function DiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requirePermissionPage("discovery.view");
  const { days: daysParam } = await searchParams;
  const days = RANGES.includes(Number(daysParam)) ? Number(daysParam) : 14;
  const period = `Last ${days} days`;
  const { overview } = await loadDiscoveryOverview(days);

  if (overview.status !== 200 || !overview.data) {
    return (
      <div>
        <PageHeader title="Discovery" />
        <DiscoveryTabs active="/discovery" />
        <EmptyState>
          {overview.message ?? "Couldn't load discovery data."}
        </EmptyState>
      </div>
    );
  }

  const {
    settings,
    killSwitches,
    search,
    recommendations: rec,
    recommendationDelivery,
    deliveryTruncated,
  } = overview.data;
  const totals = search.totals ?? {
    searches: 0,
    zero_results: 0,
    clicks: 0,
    p50_ms: null,
    p95_ms: null,
  };
  const suggest = search.suggestions?.totals ?? {
    requests: 0,
    zero_results: 0,
    opened: 0,
    p50_ms: null,
    p95_ms: null,
  };
  const liveDigests = rec.digestsDaily.reduce((n, d) => n + d.live, 0);
  const shadowDigests = rec.digestsDaily.reduce((n, d) => n + d.shadow, 0);
  const activeSubs = Object.values(rec.subscriptions).reduce(
    (n, s) => n + s.active,
    0,
  );
  const rateState = ratioState(
    totals.zero_results,
    totals.searches,
    MIN_SEARCHES_FOR_A_RATE,
  );
  const rateNote =
    rateState === "no-data"
      ? `No searches in ${period.toLowerCase()}`
      : `Fewer than ${MIN_SEARCHES_FOR_A_RATE} searches, too few for a rate`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discovery"
        description={`Unified search and opt-in recommendation notices. Settings last changed ${timeAgo(settings.updatedAt)}.`}
        actions={
          <div className="flex flex-wrap gap-1">
            {RANGES.map((r) => (
              <Link
                key={r}
                href={`/discovery?days=${r}`}
                aria-current={r === days ? "page" : undefined}
                className={cn(
                  "rounded px-2 py-1 text-xs",
                  r === days
                    ? "bg-primary text-primary-foreground"
                    : "border border-border hover:bg-muted",
                )}
              >
                Last {r} days
              </Link>
            ))}
          </div>
        }
      />
      <DiscoveryTabs active="/discovery" />
      <p className="-mt-3 text-xs text-muted-foreground">
        {period} · a rolling window ending now, not whole calendar days · UTC ·
        no comparison with the period before
      </p>

      <Card className="flex flex-wrap items-center gap-2 p-3 text-sm">
        <span className="font-medium">Status</span>
        <Badge
          tone={
            settings.searchV2Enabled && !killSwitches.search
              ? "success"
              : "neutral"
          }
        >
          Search{" "}
          {killSwitches.search
            ? "off by kill switch"
            : settings.searchV2Enabled
              ? `on · ${settings.searchAudience}`
              : "off"}
        </Badge>
        <Badge
          tone={
            killSwitches.recommendations
              ? "danger"
              : settings.recommendationsEnabled
                ? settings.recommendationsShadowMode
                  ? "warning"
                  : "success"
                : "neutral"
          }
        >
          Recommendations{" "}
          {killSwitches.recommendations
            ? "off by kill switch"
            : settings.recommendationsEnabled
              ? `${settings.recommendationsShadowMode ? "shadow" : "live"} · ${settings.recommendationsAudience}`
              : "off"}
        </Badge>
        <Badge tone={settings.promptsEnabled ? "success" : "neutral"}>
          Prompts {settings.promptsEnabled ? "on" : "off"}
        </Badge>
        <Badge
          tone={
            killSwitches.recommendationEmail
              ? "danger"
              : settings.recommendationsEmailEnabled
                ? "success"
                : "neutral"
          }
        >
          Recommendation email{" "}
          {killSwitches.recommendationEmail
            ? "off by kill switch"
            : settings.recommendationsEmailEnabled
              ? "on"
              : "off"}
        </Badge>
        <span className="text-muted-foreground">
          Caps: {settings.dailyPushCap}/day, {settings.weeklyPushCap}/week ·
          digest at {settings.digestHourLocal}:00 each person's local time
        </span>
      </Card>

      <section className="space-y-3">
        <SectionHeading title="Search" className="mb-0" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <MetricCard
            metric="search.searches"
            value={totals.searches}
            period={period}
          />
          <MetricCard
            metric="search.zeroResultRate"
            value={
              totals.searches > 0 ? totals.zero_results / totals.searches : null
            }
            format="percent"
            period={period}
            state={rateState === "ok" ? undefined : rateState}
            stateNote={rateNote}
            secondary={`${totals.zero_results.toLocaleString("en-GB")} searches found nothing`}
            tone={
              rateState === "ok" && totals.zero_results / totals.searches > 0.3
                ? "warning"
                : undefined
            }
          />
          <MetricCard
            metric="search.clickThroughRate"
            value={totals.searches > 0 ? totals.clicks / totals.searches : null}
            format="percent"
            period={period}
            state={rateState === "ok" ? undefined : rateState}
            stateNote={rateNote}
            secondary={`${totals.clicks.toLocaleString("en-GB")} opened a result`}
          />
          <MetricCard
            metric="search.latencyP50"
            value={totals.p50_ms}
            format="ms"
            period={period}
            stateNote={`No searches in ${period.toLowerCase()}`}
          />
          <MetricCard
            metric="search.latencyP95"
            value={totals.p95_ms}
            format="ms"
            period={period}
            stateNote={`No searches in ${period.toLowerCase()}`}
            tone={(totals.p95_ms ?? 0) > 800 ? "warning" : undefined}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold">Top searches</p>
            {search.topQueries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No searches recorded in {period.toLowerCase()}.
              </p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Query</Th>
                    <Th className="text-right">Searches</Th>
                    <Th className="text-right">Opened a result</Th>
                    <Th className="text-right">Found nothing</Th>
                  </tr>
                </thead>
                <tbody>
                  {search.topQueries.map((q) => (
                    <tr key={q.query_norm}>
                      <Td className="font-mono text-xs">{q.query_norm}</Td>
                      <Td className="text-right tabular-nums">{q.searches}</Td>
                      <Td className="text-right tabular-nums">
                        {q.searches > 0
                          ? `${Math.round((q.clicks / q.searches) * 100)}%`
                          : "—"}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {q.zero_results}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card className="p-4">
            <p className="mb-1 text-sm font-semibold">
              Searches with no results
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              What people looked for and could not find: missing listings,
              spelling, or wording to add.
            </p>
            {search.zeroResultQueries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                None in {period.toLowerCase()}.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {search.zeroResultQueries.map((q) => (
                  <li key={q.query_norm} className="flex justify-between gap-4">
                    <span className="font-mono text-xs">{q.query_norm}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {q.searches}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold">Searches by kind</p>
            <KeyValues
              family="searchMode"
              rows={Object.fromEntries(
                search.byMode.map((m) => [m.mode, m.searches]),
              )}
            />
            <p className="mb-2 mt-4 text-sm font-semibold">
              Searches by platform
            </p>
            <KeyValues
              family="platform"
              rows={Object.fromEntries(
                search.byPlatform.map((p) => [p.platform, p.searches]),
              )}
            />
          </Card>
          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold">Opened results by type</p>
            <KeyValues
              family="searchResultType"
              rows={Object.fromEntries(
                search.clicksByType.map((c) => [c.clicked_type, c.clicks]),
              )}
            />
          </Card>
        </div>
        <SectionHeading title="Type-ahead" className="mb-0 mt-2" />
        <div className="grid gap-3 md:grid-cols-3">
          <MetricCard
            metric="search.suggestRequests"
            value={suggest.requests}
            period={period}
          />
          <MetricCard
            metric="search.suggestOpenRate"
            value={
              suggest.requests > 0 ? suggest.opened / suggest.requests : null
            }
            format="percent"
            period={period}
            stateNote={`No suggestions in ${period.toLowerCase()}`}
            secondary={`${suggest.opened.toLocaleString("en-GB")} opened a suggestion`}
          />
          <MetricCard
            metric="search.suggestLatencyP95"
            value={suggest.p95_ms}
            format="ms"
            period={period}
            stateNote={`No suggestions in ${period.toLowerCase()}`}
            tone={(suggest.p95_ms ?? 0) > 300 ? "warning" : undefined}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold">
              Suggestion lists by platform
            </p>
            <KeyValues
              family="platform"
              rows={Object.fromEntries(
                (search.suggestions?.byPlatform ?? []).map((p) => [
                  p.platform,
                  p.requests,
                ]),
              )}
            />
          </Card>
          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold">
              Opened suggestions by type
            </p>
            <KeyValues
              family="searchResultType"
              rows={Object.fromEntries(
                (search.suggestions?.openedByType ?? []).map((c) => [
                  c.clicked_type,
                  c.opened,
                ]),
              )}
            />
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading title="Recommendations" className="mb-0" />
        {deliveryTruncated ? (
          <CapNotice
            fetched={deliveryTruncated.fetched}
            total={deliveryTruncated.total}
            noun="recommendation pushes"
          />
        ) : null}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <MetricCard
            metric="recommendations.activeSubscriptions"
            value={activeSubs}
            period="Right now"
          />
          <MetricCard
            metric="recommendations.liveDigests"
            value={liveDigests}
            period={period}
          />
          <MetricCard
            metric="recommendations.shadowDigests"
            value={shadowDigests}
            period={period}
            secondary="Would have been sent"
          />
          <MetricCard
            metric="recommendations.openRate"
            value={rec.openRate}
            format="percent"
            period={period}
            stateNote="No push delivered yet"
          />
          <MetricCard
            metric="recommendations.dismissRate"
            value={rec.dismissRate}
            format="percent"
            period={period}
            stateNote="No picks shown yet"
            tone={(rec.dismissRate ?? 0) > 0.25 ? "warning" : undefined}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold">
              Active subscriptions, by kind
            </p>
            <KeyValues
              family="subscriptionKind"
              rows={Object.fromEntries(
                Object.entries(rec.subscriptions).map(([k, v]) => [
                  k,
                  v.active,
                ]),
              )}
            />
            <p className="mb-2 mt-4 text-sm font-semibold">
              New, by where they came from
            </p>
            <KeyValues
              family="subscriptionSource"
              rows={rec.subscriptionsBySource}
            />
          </Card>
          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold">Opt-in prompts</p>
            <ul className="space-y-1 text-sm">
              {(
                [
                  ["Shown", rec.prompts?.shown ?? 0],
                  ["Accepted", rec.prompts?.accepted ?? 0],
                  ["Dismissed (“Not now”)", rec.prompts?.dismissed ?? 0],
                ] as const
              ).map(([label, value]) => (
                <li key={label} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="tabular-nums">{value}</span>
                </li>
              ))}
            </ul>
            <p className="mb-2 mt-4 text-sm font-semibold">
              Digests per person
            </p>
            <ul className="space-y-1 text-sm">
              {(["live", "shadow"] as const).map((k) => {
                const d = rec.perUserDigests?.[k];
                return (
                  <li key={k} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      {k === "live" ? "Live" : "Shadow"}
                    </span>
                    <span className="tabular-nums">
                      {d?.users ?? 0} people · median {d?.p50 ?? "—"} · p95{" "}
                      {d?.p95 ?? "—"} · most {d?.max ?? "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold">
              Why candidates were held back
            </p>
            <KeyValues family="suppressReason" rows={rec.suppressedByReason} />
            <p className="mb-2 mt-4 text-sm font-semibold">Digests skipped</p>
            <KeyValues family="digestSkipReason" rows={rec.skipsByReason} />
            <p className="mb-2 mt-4 text-sm font-semibold">
              Push delivery (recommendations)
            </p>
            <KeyValues family="deliveryStatus" rows={recommendationDelivery} />
          </Card>
        </div>
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold">Digests per day</p>
          {rec.digestsDaily.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No digests in {period.toLowerCase()}.
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th className="text-right">Live</Th>
                  <Th className="text-right">Shadow</Th>
                  <Th className="text-right">Picks</Th>
                  <Th className="text-right">Opened</Th>
                </tr>
              </thead>
              <tbody>
                {rec.digestsDaily.map((d) => (
                  <tr key={d.date}>
                    <Td>{d.date}</Td>
                    <Td className="text-right tabular-nums">{d.live}</Td>
                    <Td className="text-right tabular-nums">{d.shadow}</Td>
                    <Td className="text-right tabular-nums">{d.items}</Td>
                    <Td className="text-right tabular-nums">{d.opened}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Before leaving shadow mode: p95 digests per person per week at or
            below the weekly cap, the same event rarely offered twice, and
            candidates held back for “listing no longer visible” under 5%.
          </p>
        </Card>
      </section>
    </div>
  );
}
