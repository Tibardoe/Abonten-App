import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Stat,
  timeAgo,
} from "@/components/ui";
import { requireAdmin } from "@/lib/adminGuard";
import { loadErrorGroup } from "@/lib/data";
import Link from "next/link";
import { ErrorGroupControls } from "./ErrorGroupControls";

function tally(list: (string | null | undefined)[]): [string, number][] {
  const m = new Map<string, number>();
  for (const v of list) {
    const k = v || "unknown";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export default async function ErrorGroupPage({
  params,
}: {
  params: Promise<{ fingerprint: string }>;
}) {
  const { fingerprint } = await params;
  const ctx = await requireAdmin();
  const res = await loadErrorGroup(decodeURIComponent(fingerprint));

  if (res.status !== 200 || !res.data) {
    return <EmptyState>{res.message ?? "Error group not found."}</EmptyState>;
  }
  const { group: g, samples } = res.data;
  const canManage = ctx.permissions.includes("monitoring.manage");

  const byPlatform = tally(samples.map((s) => s.platform));
  const byVersion = tally(samples.map((s) => s.appVersion));
  const byRoute = tally(samples.map((s) => s.route)).slice(0, 6);

  return (
    <div>
      <PageHeader
        title={g.title}
        description={
          <Link href="/monitoring" className="text-primary hover:underline">
            ← Back to monitoring
          </Link>
        }
        actions={
          <Badge
            tone={
              g.status === "open"
                ? "danger"
                : g.status === "resolved"
                  ? "success"
                  : "neutral"
            }
          >
            {g.status}
          </Badge>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Occurrences" value={g.eventCount} />
        <Stat label="First seen" value={timeAgo(g.firstSeen)} />
        <Stat label="Last seen" value={timeAgo(g.lastSeen)} />
        <Stat label="Platforms" value={g.platforms.join(", ") || "—"} />
      </div>

      {canManage && (
        <Card className="mb-4 p-3">
          <ErrorGroupControls fingerprint={g.fingerprint} />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">
              Recent samples ({samples.length})
            </h3>
            {samples.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No individual events retained.
              </p>
            ) : (
              <ul className="space-y-3 text-sm">
                {samples.map((s) => (
                  <li key={s.id} className="rounded border border-border p-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge
                        tone={
                          s.severity === "fatal" || s.severity === "error"
                            ? "danger"
                            : s.severity === "warning"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {s.severity}
                      </Badge>
                      <span className="text-muted-foreground">
                        {s.platform}
                        {s.appVersion ? ` · v${s.appVersion}` : ""}
                        {s.route ? ` · ${s.route}` : ""} ·{" "}
                        {timeAgo(s.occurredAt)}
                      </span>
                    </div>
                    {s.message ? (
                      <p className="mt-1 break-words">{s.message}</p>
                    ) : null}
                    {s.stack ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-muted-foreground">
                          Stack
                        </summary>
                        <pre className="mt-1 max-h-56 overflow-auto rounded bg-muted/50 p-2 text-xs">
                          {s.stack}
                        </pre>
                      </details>
                    ) : null}
                    {s.context ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-muted-foreground">
                          Context
                        </summary>
                        <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted/50 p-2 text-xs">
                          {JSON.stringify(s.context, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-1">
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">
              Breakdown (from samples)
            </h3>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              By platform
            </p>
            <ul className="mb-3 space-y-0.5 text-sm">
              {byPlatform.map(([k, n]) => (
                <li key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {n}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              By app version
            </p>
            <ul className="mb-3 space-y-0.5 text-sm">
              {byVersion.map(([k, n]) => (
                <li key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {n}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Top routes
            </p>
            <ul className="space-y-0.5 text-sm">
              {byRoute.map(([k, n]) => (
                <li key={k} className="flex justify-between gap-2">
                  <span className="truncate">{k}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {n}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-3 text-xs text-muted-foreground">
            Fingerprint <code>{g.fingerprint}</code>
            {g.errorType ? (
              <>
                <br />
                Type {g.errorType}
              </>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
