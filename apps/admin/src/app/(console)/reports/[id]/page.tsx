import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  priorityTone,
  reportStatusTone,
  timeAgo,
} from "@/components/ui";
import { requireAdmin } from "@/lib/adminGuard";
import { loadReportDetail } from "@/lib/data";
import { REPORT_CATEGORY_LABEL } from "@abonten/types/adminTypes";
import Link from "next/link";
import { ActionPanel } from "./ActionPanel";

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireAdmin();
  const res = await loadReportDetail(id);

  if (res.status !== 200 || !res.data) {
    return <EmptyState>{res.message ?? "Report not found."}</EmptyState>;
  }
  const r = res.data;

  return (
    <div>
      <PageHeader
        title={`Report · ${r.targetType}`}
        description={
          <Link href="/reports" className="text-primary hover:underline">
            ← Back to queue
          </Link>
        }
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={priorityTone(r.priority)}>{r.priority}</Badge>
            <Badge tone={reportStatusTone(r.status)}>
              {r.status.replace("_", " ")}
            </Badge>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Report</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Reason</dt>
              <dd>{REPORT_CATEGORY_LABEL[r.category]}</dd>
              <dt className="text-muted-foreground">Source</dt>
              <dd>{r.source}</dd>
              <dt className="text-muted-foreground">Filed</dt>
              <dd>{new Date(r.createdAt).toLocaleString()}</dd>
              <dt className="text-muted-foreground">Reports on this target</dt>
              <dd>{r.priorReportsOnTarget}</dd>
            </dl>
            {r.details ? (
              <p className="mt-3 whitespace-pre-wrap rounded bg-muted/50 p-2 text-sm">
                {r.details}
              </p>
            ) : null}
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Target snapshot</h3>
            {r.targetSnapshot ? (
              <pre className="max-h-64 overflow-auto rounded bg-muted/50 p-2 text-xs">
                {JSON.stringify(r.targetSnapshot, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">
                Target no longer exists or could not be loaded.
              </p>
            )}
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Reporter</h3>
            <p className="text-sm">
              {r.reporter.fullName ||
                r.reporter.username ||
                (r.reporter.id ? `${r.reporter.id.slice(0, 8)}…` : "unknown")}
              {r.reporter.email ? (
                <span className="text-muted-foreground">
                  {" "}
                  · {r.reporter.email}
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {r.reporter.priorReportsByReporter} report(s) filed by this
              account overall
            </p>
          </Card>

          {r.attachments.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Evidence</h3>
              <ul className="space-y-1 text-sm">
                {r.attachments.map((a) => (
                  <li key={a.id}>
                    {a.url ? (
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        {a.fileName ?? "attachment"}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">
                        {a.fileName ?? "attachment"} (link expired)
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      {" "}
                      · {a.mimeType ?? "?"} ·{" "}
                      {a.sizeBytes
                        ? `${Math.round(a.sizeBytes / 1024)} KB`
                        : "?"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">
                Links expire after 5 minutes.
              </p>
            </Card>
          )}

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">History</h3>
            <ol className="space-y-2 text-sm">
              {r.timeline.map((t) => (
                <li key={t.id} className="flex gap-2">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">
                    {timeAgo(t.createdAt)}
                  </span>
                  <span>
                    <span className="font-medium">
                      {t.kind.replace("_", " ")}
                    </span>
                    {t.actorName ? (
                      <span className="text-muted-foreground">
                        {" "}
                        by {t.actorName}
                      </span>
                    ) : null}
                    {t.data ? (
                      <span className="text-muted-foreground">
                        {" "}
                        — {JSON.stringify(t.data)}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          {r.notes.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Internal notes</h3>
              <ul className="space-y-2 text-sm">
                {r.notes.map((n) => (
                  <li key={n.id} className="rounded bg-muted/50 p-2">
                    <p className="whitespace-pre-wrap">{n.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {n.authorName ?? "admin"} · {timeAgo(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {r.resolution ? (
            <Card className="p-4">
              <h3 className="mb-1 text-sm font-semibold">Resolution</h3>
              <p className="text-sm">
                <Badge tone={reportStatusTone(r.status)}>
                  {r.status.replace("_", " ")}
                </Badge>{" "}
                {r.resolutionAction ? `(${r.resolutionAction})` : null}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{r.resolution}</p>
            </Card>
          ) : null}
        </div>

        <div className="lg:col-span-1">
          <ActionPanel
            reportId={r.id}
            status={r.status}
            updatedAt={r.updatedAt}
            targetType={r.targetType}
            targetId={r.targetId}
            assignedTo={r.assignedTo}
            selfId={ctx.userId}
            permissions={ctx.permissions}
          />
        </div>
      </div>
    </div>
  );
}
