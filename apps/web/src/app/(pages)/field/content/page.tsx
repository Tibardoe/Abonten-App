import { getMyFieldOpsContent } from "@/actions/fieldOps/getMyFieldOpsContent";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import StatusChip from "@/fieldOps/atoms/StatusChip";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import ContentSubmitForm from "@/fieldOps/organisms/ContentSubmitForm";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const money = (minor: number, currency: string) =>
  `${currency} ${(minor / 100).toFixed(2)}`;

export default async function FieldContentPage() {
  const me = await loadFieldOpsMe();
  const current = me.data?.current;
  if (!current) notFound();

  const res = await getMyFieldOpsContent({ campaignId: current.campaign.id });
  const content = res.data;
  if (!content) notFound();

  const open = content.briefs.filter((b) => b.status === "open");
  const closed = content.briefs.filter((b) => b.status !== "open");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>Content</PageTitle>
        <SupportingText>
          What the campaign wants made, and what you have sent in.
          {content.liveRate
            ? ` You earn ${money(content.liveRate.amountMinor, content.liveRate.currency)} per approved post.`
            : ""}
        </SupportingText>
      </div>

      {content.canSubmit ? (
        <ContentSubmitForm
          campaignId={current.campaign.id}
          briefs={content.briefs}
        />
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Briefs</h2>
        {open.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Nothing open right now. Your team lead adds briefs here.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {open.map((b) => (
              <li key={b.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium">{b.title}</p>
                  {b.dueOn ? (
                    <span className="text-sm text-muted-foreground">
                      by {new Date(b.dueOn).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
                {b.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {b.description}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  {b.platforms.length > 0
                    ? b.platforms.join(", ")
                    : "any platform"}
                  {b.submissionCount > 0
                    ? ` · ${b.submissionCount} sent in`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
        {closed.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {closed.length} closed brief{closed.length === 1 ? "" : "s"}.
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Your posts</h2>
        {content.submissions.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Nothing sent in yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {content.submissions.map((s) => (
              <li key={s.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all font-medium text-primary hover:underline"
                    >
                      {s.url}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {s.platform}
                      {s.briefTitle ? ` · ${s.briefTitle}` : ""} ·{" "}
                      {new Date(s.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusChip
                    status={
                      s.status === "approved"
                        ? "verified"
                        : s.status === "rejected"
                          ? "rejected"
                          : "submitted"
                    }
                  />
                </div>
                {s.reviewNote ? (
                  <p className="mt-2 text-sm">Lead: {s.reviewNote}</p>
                ) : null}
                {s.status === "approved" && s.holdingUntil ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Commission confirmed after{" "}
                    {new Date(s.holdingUntil).toLocaleDateString()}.
                  </p>
                ) : null}
                {s.selfReportedMetrics.views !== undefined ||
                s.selfReportedMetrics.likes !== undefined ||
                s.selfReportedMetrics.shares !== undefined ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Your figures: {s.selfReportedMetrics.views ?? 0} views ·{" "}
                    {s.selfReportedMetrics.likes ?? 0} likes ·{" "}
                    {s.selfReportedMetrics.shares ?? 0} shares
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
