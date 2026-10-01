import { getMyFieldOpsContent } from "@/actions/fieldOps/getMyFieldOpsContent";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import StatusChip from "@/fieldOps/atoms/StatusChip";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import ContentSubmitForm from "@/fieldOps/organisms/ContentSubmitForm";
import { formatMinor } from "@abonten/core/content/campaignMoney";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FieldContentPage() {
  const t = await getTranslations("fieldOps");
  const locale = await getLocale();
  const money = (minor: number, currency: string) =>
    formatMinor(minor, currency, locale);
  const format = await getFormatter();

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
        <PageTitle>{t("content")}</PageTitle>
        <SupportingText>
          {t("whatTheCampaignWantsMadeAnd")}
          {content.liveRate
            ? ` ${t("youEarnPerApprovedPost", {
                money: money(
                  content.liveRate.amountMinor,
                  content.liveRate.currency,
                ),
              })}`
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
        <h2 className="text-lg font-semibold">{t("briefs")}</h2>
        {open.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            {t("nothingOpenRightNowYourTeam")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {open.map((b) => (
              <li key={b.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium">{b.title}</p>
                  {b.dueOn ? (
                    <span className="text-sm text-muted-foreground">
                      {t("by", {
                        date: format.dateTime(new Date(b.dueOn), {
                          dateStyle: "medium",
                        }),
                      })}
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
                    : t("anyPlatform")}
                  {b.submissionCount > 0
                    ? t("sentIn2", { submissionCount: b.submissionCount })
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
        {closed.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("closedBrief", { length: closed.length })}.
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("yourPosts")}</h2>
        {content.submissions.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            {t("nothingSentInYet")}
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
                      {format.dateTime(new Date(s.createdAt), {
                        dateStyle: "medium",
                      })}
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
                  <p className="mt-2 text-sm">
                    {t("lead", { reviewNote: s.reviewNote })}
                  </p>
                ) : null}
                {s.status === "approved" && s.holdingUntil ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("commissionConfirmedAfter", {
                      date: format.dateTime(new Date(s.holdingUntil), {
                        dateStyle: "medium",
                      }),
                    })}
                  </p>
                ) : null}
                {s.selfReportedMetrics.views !== undefined ||
                s.selfReportedMetrics.likes !== undefined ||
                s.selfReportedMetrics.shares !== undefined ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("yourFiguresSummary", {
                      views: s.selfReportedMetrics.views ?? 0,
                      likes: s.selfReportedMetrics.likes ?? 0,
                      shares: s.selfReportedMetrics.shares ?? 0,
                    })}
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
