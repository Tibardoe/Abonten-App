import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  timeAgo,
} from "@/components/ui";
import { loadMonitoring } from "@/lib/data";
import type { HealthCheckSnapshot } from "@abonten/types/adminTypes";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { ErrorGroupRow } from "./ErrorGroupRow";
import { IncidentPanel } from "./IncidentPanel";
import { SentryCheckButton } from "./SentryCheckButton";

// Friendly labels for the health check keys (the raw keys are terse).
const HEALTH_LABELS: Record<string, string> = {
  self: "Endpoint reachability",
  db: "Database",
  auth: "Auth",
  storage: "Storage",
  paystack: "Paystack",
  resend: "Resend (email)",
  hubtel: "Hubtel (SMS/OTP)",
  cloudinary: "Cloudinary",
  push: "Expo push",
};

// Pull the human-readable failure cause out of a down check's detail blob.
function failureNote(detail: Record<string, unknown> | null): string | null {
  if (!detail) return null;
  const reason = typeof detail.reason === "string" ? detail.reason : null;
  const error = typeof detail.error === "string" ? detail.error : null;
  const httpStatus =
    typeof detail.httpStatus === "number"
      ? detail.httpStatus
      : typeof detail.http_status === "number"
        ? detail.http_status
        : null;
  return reason ?? error ?? (httpStatus != null ? `HTTP ${httpStatus}` : null);
}

// self first, then failing checks, then the rest — most useful at a glance.
function sortHealth(rows: HealthCheckSnapshot[]): HealthCheckSnapshot[] {
  return [...rows].sort((a, b) => {
    if ((a.key === "self") !== (b.key === "self"))
      return a.key === "self" ? -1 : 1;
    if (a.ok !== b.ok) return a.ok ? 1 : -1;
    return a.key.localeCompare(b.key);
  });
}

export default async function MonitoringPage() {
  const { ctx, health, errors, metrics, incidents } = await loadMonitoring();
  const canManage = ctx.permissions.includes("monitoring.manage");
  const canIncidents = ctx.permissions.includes("incidents.manage");

  // aggregate the last-24h request metrics
  const totals = (metrics.data ?? []).reduce(
    (acc, p) => {
      acc.total += p.total;
      acc.err += p.errCount;
      return acc;
    },
    { total: 0, err: 0 },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitoring"
        description="Dependency health, grouped errors, and request telemetry."
      />

      <p className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>
          <strong>Actual telemetry</strong> (errors, request metrics) comes from
          the in-app
          <code> reportError</code> hooks and sampled request timing.{" "}
          <strong>Health</strong> rows are live dependency probes run by the
          observability cron. Request telemetry below is the{" "}
          <strong>mobile</strong> app&apos;s sampled HTTP timings; web + API
          request performance lives in the <code>abonten-web</code> Sentry
          project.
        </span>
      </p>

      {canManage && <SentryCheckButton />}

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          Application health
          {health.status === 200 && (health.data ?? []).length > 0 && (
            <span className="font-normal">
              — {(health.data ?? []).filter((h) => h.ok).length}/
              {(health.data ?? []).length} healthy · last run{" "}
              {timeAgo(
                (health.data ?? [])
                  .map((h) => h.checkedAt)
                  .sort()
                  .at(-1) ?? null,
              )}
            </span>
          )}
        </h2>
        {health.status !== 200 || (health.data ?? []).length === 0 ? (
          <EmptyState>
            No health results yet. The <code>abonten-health-check</code> pg_cron
            job runs <code>/api/observability/health</code> every 2 minutes and
            records a row per dependency — plus an{" "}
            <code>Endpoint reachability</code> row if the call itself is
            rejected or unreachable. An empty panel means the job has not run
            once yet (check <code>cron.job</code> /{" "}
            <code>observability_config</code>).
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {sortHealth(health.data ?? []).map((h) => {
              const note = h.ok ? null : failureNote(h.detail);
              return (
                <Card key={h.key} className="flex flex-col gap-1.5 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {HEALTH_LABELS[h.key] ?? h.key}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {h.latencyMs != null ? `${h.latencyMs}ms · ` : ""}
                        {timeAgo(h.checkedAt)}
                      </p>
                    </div>
                    {h.ok ? (
                      <Badge tone="success">
                        <CheckCircle2 className="h-3 w-3" /> ok
                      </Badge>
                    ) : (
                      <Badge tone="danger">
                        <XCircle className="h-3 w-3" /> down
                      </Badge>
                    )}
                  </div>
                  {note && (
                    <p className="text-xs text-destructive/90 leading-snug">
                      {note}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
          Request telemetry — mobile (last 24h)
        </h2>
        {(metrics.data ?? []).length === 0 ? (
          <EmptyState>
            No sampled request metrics yet. The mobile app beacons ~10% of its
            API calls into <code>app_request_metric</code>; web + API timing is
            in Sentry.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4">
              <p className="text-xs uppercase text-muted-foreground">
                Sampled requests
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {totals.total.toLocaleString()}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase text-muted-foreground">
                Error responses
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {totals.err.toLocaleString()}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase text-muted-foreground">
                Error rate
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {totals.total
                  ? `${((totals.err / totals.total) * 100).toFixed(2)}%`
                  : "—"}
              </p>
            </Card>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
          Error groups
        </h2>
        {errors.status !== 200 || (errors.data ?? []).length === 0 ? (
          <EmptyState>
            No errors captured. That&apos;s good — or telemetry hasn&apos;t
            started flowing yet.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Error</Th>
                <Th>Count</Th>
                <Th>Platforms</Th>
                <Th>Last seen</Th>
                <Th>Status</Th>
                {canManage && <Th />}
              </tr>
            </thead>
            <tbody>
              {(errors.data ?? []).map((g) => (
                <ErrorGroupRow
                  key={g.fingerprint}
                  group={g}
                  canManage={canManage}
                />
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
          Incidents
        </h2>
        <IncidentPanel
          incidents={incidents.data ?? []}
          canManage={canIncidents}
        />
      </section>
    </div>
  );
}
