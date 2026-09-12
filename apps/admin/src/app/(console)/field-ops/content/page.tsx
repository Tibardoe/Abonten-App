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
import { loadFieldOpsContent } from "@/lib/data";
import Link from "next/link";
import { FieldOpsTabs } from "../FieldOpsTabs";
import { ContentDecision, StipendRun } from "./ContentControls";

const STATUSES = [
  { key: "", label: "All" },
  { key: "submitted", label: "Waiting" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

export default async function FieldOpsContentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { ctx, content, campaigns } = await loadFieldOpsContent({
    campaignId: sp.campaign || undefined,
    status: sp.status || undefined,
  });
  const canDecide = ctx.permissions.includes("fieldops.verify");
  const canPayStipends = ctx.permissions.includes(
    "fieldops.commissions.approve",
  );
  const allCampaigns = campaigns.status === 200 ? (campaigns.data ?? []) : [];

  const qs = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({
      status: sp.status,
      campaign: sp.campaign,
      ...extra,
    })) {
      if (v) q.set(k, v);
    }
    return `/field-ops/content?${q.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Field Ops - Content"
        description="What each campaign asked for, what the creator posted, and the monthly stipends. Engagement figures are the creator's own report and nothing is paid on them."
      />
      <FieldOpsTabs active="/field-ops/content" />

      <div className="mb-3 flex flex-wrap items-center gap-1">
        {STATUSES.map((t) => (
          <Link
            key={t.key || "all"}
            href={qs({ status: t.key || undefined })}
            className={cn(
              "rounded px-2.5 py-1 text-xs",
              (sp.status ?? "") === t.key
                ? "bg-primary text-primary-foreground"
                : "border border-border hover:bg-muted",
            )}
          >
            {t.label}
          </Link>
        ))}
        <form className="ml-auto flex items-center gap-1 text-xs">
          {sp.status ? (
            <input type="hidden" name="status" value={sp.status} />
          ) : null}
          <select
            name="campaign"
            defaultValue={sp.campaign ?? ""}
            className="rounded border border-border bg-background px-2 py-1"
          >
            <option value="">All campaigns</option>
            {allCampaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded border border-border px-2 py-1 hover:bg-muted"
          >
            Filter
          </button>
        </form>
      </div>

      {canPayStipends && sp.campaign ? (
        <div className="mb-4">
          <StipendRun campaignId={sp.campaign} />
        </div>
      ) : null}

      {content.status !== 200 || !content.data ? (
        <EmptyState>{content.message ?? "Could not load content."}</EmptyState>
      ) : (
        <>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            Deliverables
          </h2>
          {content.data.submissions.length === 0 ? (
            <EmptyState>Nothing in this view.</EmptyState>
          ) : (
            <div className="space-y-3">
              {content.data.submissions.map((s) => (
                <Card key={s.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all font-medium text-primary hover:underline"
                      >
                        {s.url}
                      </a>
                      <p className="text-xs text-muted-foreground">
                        {s.memberName ?? s.memberUserId.slice(0, 8)} ·{" "}
                        {s.platform} · {s.campaignName}
                        {s.briefTitle ? ` · ${s.briefTitle}` : ""} ·{" "}
                        {timeAgo(s.createdAt)}
                      </p>
                    </div>
                    <Badge
                      tone={
                        s.status === "approved"
                          ? "success"
                          : s.status === "rejected"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {s.status}
                    </Badge>
                  </div>
                  {s.caption ? (
                    <p className="mt-2 text-sm">{s.caption}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Self-reported: {s.selfReportedMetrics.views ?? 0} views ·{" "}
                    {s.selfReportedMetrics.likes ?? 0} likes ·{" "}
                    {s.selfReportedMetrics.shares ?? 0} shares
                  </p>
                  {s.reviewNote ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Note: {s.reviewNote}
                    </p>
                  ) : null}
                  {canDecide && s.status === "submitted" ? (
                    <ContentDecision
                      campaignId={s.campaignId}
                      submissionId={s.id}
                    />
                  ) : null}
                </Card>
              ))}
            </div>
          )}

          <h2 className="mb-2 mt-6 text-sm font-semibold text-muted-foreground">
            Briefs
          </h2>
          {content.data.briefs.length === 0 ? (
            <EmptyState>No briefs yet.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Brief</Th>
                  <Th>Campaign</Th>
                  <Th>Assigned</Th>
                  <Th>Due</Th>
                  <Th>Sent in</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {content.data.briefs.map((b) => (
                  <tr key={b.id} className="hover:bg-muted/40">
                    <Td>{b.title}</Td>
                    <Td>{b.campaignName}</Td>
                    <Td>{b.assignedMemberName ?? "-"}</Td>
                    <Td>{b.dueOn ?? "-"}</Td>
                    <Td>{b.submissionCount}</Td>
                    <Td>
                      <Badge tone={b.status === "open" ? "info" : "neutral"}>
                        {b.status}
                      </Badge>
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
