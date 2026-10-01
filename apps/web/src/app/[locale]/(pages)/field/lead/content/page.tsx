import { listFieldOpsLeadTeam } from "@/actions/fieldOps/listFieldOpsLeadTeam";
import { listFieldOpsTeamContent } from "@/actions/fieldOps/listFieldOpsTeamContent";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import StatusChip from "@/fieldOps/atoms/StatusChip";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import ContentBriefForm from "@/fieldOps/organisms/ContentBriefForm";
import ContentReviewRow from "@/fieldOps/organisms/ContentReviewRow";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FieldLeadContentPage() {
  const me = await loadFieldOpsMe();
  const current = me.data?.current;
  if (!current || !current.isLead) notFound();

  const [res, team] = await Promise.all([
    listFieldOpsTeamContent({ campaignId: current.campaign.id }),
    listFieldOpsLeadTeam({ campaignId: current.campaign.id }),
  ]);
  const content = res.data;
  if (!content) notFound();

  const creatorRow = (team.data ?? []).find(
    (m) => m.role === "content_creator" && m.status === "active",
  );
  const waiting = content.submissions.filter((s) => s.status === "submitted");
  const decided = content.submissions.filter((s) => s.status !== "submitted");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>Content</PageTitle>
        <SupportingText>
          Brief your content creator and review what comes back.
        </SupportingText>
      </div>

      <ContentBriefForm
        campaignId={current.campaign.id}
        creator={
          creatorRow ? { id: creatorRow.id, name: creatorRow.fullName } : null
        }
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          Waiting for you ({waiting.length})
        </h2>
        {waiting.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Nothing to review.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {waiting.map((s) => (
              <li key={s.id} className="rounded-xl border p-4">
                <Link
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all font-medium text-primary hover:underline"
                >
                  {s.url}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {s.memberName ?? "the creator"} · {s.platform}
                  {s.briefTitle ? ` · ${s.briefTitle}` : ""} ·{" "}
                  {new Date(s.createdAt).toLocaleDateString()}
                </p>
                {s.caption ? <p className="mt-2 text-sm">{s.caption}</p> : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  Their own figures: {s.selfReportedMetrics.views ?? 0} views ·{" "}
                  {s.selfReportedMetrics.likes ?? 0} likes ·{" "}
                  {s.selfReportedMetrics.shares ?? 0} shares. Nothing is paid on
                  these — open the link and judge the work.
                </p>
                <ContentReviewRow
                  campaignId={current.campaign.id}
                  submissionId={s.id}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Briefs</h2>
        {content.briefs.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            No briefs yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {content.briefs.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
              >
                <div>
                  <p className="font-medium">{b.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.platforms.length > 0
                      ? b.platforms.join(", ")
                      : "any platform"}
                    {b.dueOn
                      ? ` · by ${new Date(b.dueOn).toLocaleDateString()}`
                      : ""}
                    {` · ${b.submissionCount} sent in`}
                  </p>
                </div>
                <StatusChip status={b.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {decided.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Already decided</h2>
          <ul className="flex flex-col gap-2">
            {decided.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
              >
                <Link
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 break-all text-sm text-primary hover:underline"
                >
                  {s.url}
                </Link>
                <StatusChip
                  status={s.status === "approved" ? "verified" : "rejected"}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
