import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
  timeAgo,
} from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadDiscoveryOverview } from "@/lib/data";
import Link from "next/link";
import { DiscoveryTabs } from "./DiscoveryTabs";

// Admin › Discovery: is search helping people find things, and are
// recommendation notices useful rather than noisy? Shadow-mode projections
// sit next to live numbers so the programme can be judged before any push
// goes out.

const RANGES = [7, 14, 30, 90];

const pct = (n: number | null | undefined) =>
  n == null ? "—" : `${(n * 100).toFixed(1)}%`;

function ratio(part: number, whole: number) {
  return whole === 0 ? "—" : `${((part / whole) * 100).toFixed(1)}%`;
}

function KeyValues({
  rows,
}: { rows: Record<string, number> | null | undefined }) {
  const entries = Object.entries(rows ?? {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {entries.map(([k, v]) => (
        <li key={k} className="flex justify-between gap-4">
          <span className="text-muted-foreground">
            {k.replaceAll("_", " ")}
          </span>
          <span className="tabular-nums">{v}</span>
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
    deliveryBySource,
  } = overview.data;
  const totals = search.totals ?? {
    searches: 0,
    zero_results: 0,
    clicks: 0,
    p50_ms: null,
    p95_ms: null,
  };
  const recDelivery = deliveryBySource.recommendations ?? {};
  const liveDigests = rec.digestsDaily.reduce((n, d) => n + d.live, 0);
  const shadowDigests = rec.digestsDaily.reduce((n, d) => n + d.shadow, 0);
  const activeSubs = Object.values(rec.subscriptions).reduce(
    (n, s) => n + s.active,
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discovery"
        description={`Unified search and opt-in recommendation notices. Settings last changed ${timeAgo(settings.updatedAt)}.`}
        actions={
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <Link
                key={r}
                href={`/discovery?days=${r}`}
                className={`rounded px-2.5 py-1 text-xs ${r === days ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted"}`}
              >
                {r}d
              </Link>
            ))}
          </div>
        }
      />
      <DiscoveryTabs active="/discovery" />

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
            ? "killed (env)"
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
            ? "killed (env)"
            : settings.recommendationsEnabled
              ? `${settings.recommendationsShadowMode ? "shadow" : "live"} · ${settings.recommendationsAudience}`
              : "off"}
        </Badge>
        <Badge tone={settings.promptsEnabled ? "success" : "neutral"}>
          Prompts {settings.promptsEnabled ? "on" : "off"}
        </Badge>
        <span className="text-muted-foreground">
          Caps: {settings.dailyPushCap}/day, {settings.weeklyPushCap}/week ·
          digest at {settings.digestHourLocal}:00 Accra
        </span>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Search
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat
            label="Searches"
            value={totals.searches}
            hint={`last ${days} days`}
          />
          <Stat
            label="Zero results"
            value={ratio(totals.zero_results, totals.searches)}
            hint={`${totals.zero_results} searches`}
            tone={
              totals.searches > 20 &&
              totals.zero_results / totals.searches > 0.3
                ? "warning"
                : undefined
            }
          />
          <Stat
            label="Click-through"
            value={ratio(totals.clicks, totals.searches)}
            hint={`${totals.clicks} opened a result`}
          />
          <Stat
            label="Latency p50"
            value={totals.p50_ms == null ? "—" : `${totals.p50_ms} ms`}
          />
          <Stat
            label="Latency p95"
            value={totals.p95_ms == null ? "—" : `${totals.p95_ms} ms`}
            tone={(totals.p95_ms ?? 0) > 800 ? "warning" : undefined}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold">Top searches</p>
            {search.topQueries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No searches recorded yet.
              </p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Query</Th>
                    <Th className="text-right">Searches</Th>
                    <Th className="text-right">CTR</Th>
                    <Th className="text-right">No results</Th>
                  </tr>
                </thead>
                <tbody>
                  {search.topQueries.map((q) => (
                    <tr key={q.query_norm}>
                      <Td className="font-mono text-xs">{q.query_norm}</Td>
                      <Td className="text-right tabular-nums">{q.searches}</Td>
                      <Td className="text-right tabular-nums">
                        {ratio(q.clicks, q.searches)}
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
              <p className="text-sm text-muted-foreground">None.</p>
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
            <p className="mb-2 text-sm font-semibold">
              Searches by kind and platform
            </p>
            <KeyValues
              rows={Object.fromEntries([
                ...search.byMode.map(
                  (m) => [`mode ${m.mode}`, m.searches] as const,
                ),
                ...search.byPlatform.map(
                  (p) => [`platform ${p.platform}`, p.searches] as const,
                ),
              ])}
            />
          </Card>
          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold">Opened results by type</p>
            <KeyValues
              rows={Object.fromEntries(
                search.clicksByType.map((c) => [c.clicked_type, c.clicks]),
              )}
            />
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Recommendations
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Active subscriptions" value={activeSubs} />
          <Stat
            label="Live digests"
            value={liveDigests}
            hint={`last ${days} days`}
          />
          <Stat
            label="Shadow digests"
            value={shadowDigests}
            hint="would have been sent"
          />
          <Stat label="Open rate" value={pct(rec.openRate)} />
          <Stat
            label="Not interested"
            value={pct(rec.dismissRate)}
            tone={(rec.dismissRate ?? 0) > 0.25 ? "warning" : undefined}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold">Subscriptions</p>
            <KeyValues
              rows={Object.fromEntries(
                Object.entries(rec.subscriptions).map(([k, v]) => [
                  `${k} (active)`,
                  v.active,
                ]),
              )}
            />
            <p className="mb-2 mt-4 text-sm font-semibold">
              New, by where they came from
            </p>
            <KeyValues rows={rec.subscriptionsBySource} />
          </Card>
          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold">Prompts</p>
            <KeyValues
              rows={{
                shown: rec.prompts?.shown ?? 0,
                accepted: rec.prompts?.accepted ?? 0,
                dismissed: rec.prompts?.dismissed ?? 0,
              }}
            />
            <p className="mb-2 mt-4 text-sm font-semibold">
              Per-person digests
            </p>
            <ul className="space-y-1 text-sm">
              {(["live", "shadow"] as const).map((k) => {
                const d = rec.perUserDigests?.[k];
                return (
                  <li key={k} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="tabular-nums">
                      {d?.users ?? 0} people · p50 {d?.p50 ?? "—"} · p95{" "}
                      {d?.p95 ?? "—"} · max {d?.max ?? "—"}
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
            <KeyValues rows={rec.suppressedByReason} />
            <p className="mb-2 mt-4 text-sm font-semibold">Digests skipped</p>
            <KeyValues rows={rec.skipsByReason} />
            <p className="mb-2 mt-4 text-sm font-semibold">
              Push delivery (recommendations)
            </p>
            <KeyValues rows={recDelivery} />
          </Card>
        </div>
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold">Digests per day</p>
          {rec.digestsDaily.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No digests in this period.
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th className="text-right">Live</Th>
                  <Th className="text-right">Shadow</Th>
                  <Th className="text-right">Items</Th>
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
            candidates held back for “not visible” under 5%.
          </p>
        </Card>
      </section>
    </div>
  );
}
