import {
  Badge,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  cn,
  priorityTone,
  reportStatusTone,
  timeAgo,
} from "@/components/ui";
import { loadReportGroups, loadReports } from "@/lib/data";
import {
  REPORT_CATEGORY_LABEL,
  type ReportPriority,
  type ReportStatus,
} from "@abonten/types/adminTypes";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "escalated", label: "Escalated" },
  { key: "awaiting_info", label: "Awaiting info" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];

const URGENT = new Set(["fraud_scam", "safety", "harassment", "impersonation"]);

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const view = sp.view === "grouped" ? "grouped" : "list";
  const status = (sp.status ?? "open") as ReportStatus | "open" | "all";
  const priority = sp.priority as ReportPriority | undefined;
  const assigned = sp.assigned === "unassigned" ? "unassigned" : undefined;

  const groups = view === "grouped" ? await loadReportGroups() : null;
  const list =
    view === "list"
      ? await loadReports({ status, priority, assignedTo: assigned, cursor: sp.cursor ?? null })
      : null;

  return (
    <div>
      <PageHeader
        title="Reports & Moderation"
        description="Triage user reports, investigate, and act on content."
        actions={
          <div className="flex gap-1">
            <Link
              href="/reports?view=list"
              className={cn(
                "rounded px-2 py-1 text-xs",
                view === "list" ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted",
              )}
            >
              List
            </Link>
            <Link
              href="/reports?view=grouped"
              className={cn(
                "rounded px-2 py-1 text-xs",
                view === "grouped" ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted",
              )}
            >
              By target
            </Link>
          </div>
        }
      />

      {view === "list" && (
        <>
          <div className="mb-3 flex flex-wrap gap-1">
            {STATUS_TABS.map((t) => (
              <Link
                key={t.key}
                href={`/reports?view=list&status=${t.key}`}
                className={cn(
                  "rounded px-2.5 py-1 text-xs",
                  status === t.key
                    ? "bg-primary text-primary-foreground"
                    : "border border-border hover:bg-muted",
                )}
              >
                {t.label}
              </Link>
            ))}
            {priority ? (
              <span className="rounded bg-muted px-2.5 py-1 text-xs">priority: {priority}</span>
            ) : null}
            {assigned ? (
              <span className="rounded bg-muted px-2.5 py-1 text-xs">unassigned</span>
            ) : null}
          </div>

          {!list || list.status !== 200 ? (
            <EmptyState>{list?.message ?? "Couldn't load reports."}</EmptyState>
          ) : list.data.length === 0 ? (
            <EmptyState>No reports match this view.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Target</Th>
                  <Th>Reason</Th>
                  <Th>Priority</Th>
                  <Th>Status</Th>
                  <Th>Reports</Th>
                  <Th>Age</Th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <Td>
                      <Link href={`/reports/${r.id}`} className="font-medium text-primary hover:underline">
                        {r.targetType}
                      </Link>
                      <div className="text-xs text-muted-foreground">{r.targetId.slice(0, 8)}…</div>
                    </Td>
                    <Td>
                      <span className="inline-flex items-center gap-1">
                        {URGENT.has(r.category) && (
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                        )}
                        {REPORT_CATEGORY_LABEL[r.category]}
                      </span>
                    </Td>
                    <Td>
                      <Badge tone={priorityTone(r.priority)}>{r.priority}</Badge>
                    </Td>
                    <Td>
                      <Badge tone={reportStatusTone(r.status)}>{r.status.replace("_", " ")}</Badge>
                    </Td>
                    <Td className="tabular-nums">{r.targetReportCount}</Td>
                    <Td className="whitespace-nowrap text-muted-foreground">{timeAgo(r.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {list?.hasNextPage && list.nextCursor ? (
            <div className="mt-3">
              <Link
                href={`/reports?view=list&status=${status}&cursor=${encodeURIComponent(list.nextCursor)}`}
                className="text-sm text-primary hover:underline"
              >
                Next page →
              </Link>
            </div>
          ) : null}
        </>
      )}

      {view === "grouped" && (
        <>
          {!groups || groups.status !== 200 || !groups.data ? (
            <EmptyState>{groups?.message ?? "Couldn't load grouped reports."}</EmptyState>
          ) : groups.data.length === 0 ? (
            <EmptyState>No targets with open reports.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Target</Th>
                  <Th>Open</Th>
                  <Th>Total reports</Th>
                  <Th>Highest priority</Th>
                  <Th>Reasons</Th>
                  <Th>Latest</Th>
                </tr>
              </thead>
              <tbody>
                {groups.data.map((g) => (
                  <tr key={g.dedupeKey} className="hover:bg-muted/40">
                    <Td>
                      <Link
                        href={`/reports?view=list&status=all&target=${g.dedupeKey}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {g.targetType}
                      </Link>
                      <div className="text-xs text-muted-foreground">{g.targetId.slice(0, 8)}…</div>
                    </Td>
                    <Td className="tabular-nums">{g.openCount}</Td>
                    <Td className="tabular-nums">{g.reportCount}</Td>
                    <Td>
                      <Badge tone={priorityTone(g.highestPriority)}>{g.highestPriority}</Badge>
                    </Td>
                    <Td className="text-xs text-muted-foreground">
                      {g.categories.map((c) => REPORT_CATEGORY_LABEL[c]).join(", ")}
                    </Td>
                    <Td className="whitespace-nowrap text-muted-foreground">
                      {timeAgo(g.latestCreatedAt)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}
