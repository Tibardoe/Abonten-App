import { listFieldOpsReviewQueue } from "@/actions/fieldOps/listFieldOpsReviewQueue";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import StatusChip from "@/fieldOps/atoms/StatusChip";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FieldLeadReviewPage() {
  const t = await getTranslations("fieldOps");
  const format = await getFormatter();

  const me = await loadFieldOpsMe();
  const current = me.data?.current;
  if (!current?.isLead) notFound();

  const res = await listFieldOpsReviewQueue({
    campaignId: current.campaign.id,
  });
  const all = res.data ?? [];
  const waiting = all.filter((o) => o.status === "submitted");
  const done = all.filter((o) => o.status !== "submitted");

  const row = (o: (typeof all)[number]) => (
    <li key={o.id} className="rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link
            href={`/field/lead/review/${o.id}`}
            className="font-medium hover:underline"
          >
            {o.businessName ?? t("noName")}
          </Link>
          <p className="text-sm text-muted-foreground">
            {[
              o.memberName ?? t("member"),
              o.territoryName ?? "—",
              o.mode === "offline" ? t("inPerson") : t("online"),
              o.submittedAt
                ? format.dateTime(new Date(o.submittedAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : null,
              o.insideTerritory === false ? t("outsideTerritory") : null,
              o.similarMatches.some((m) => m.strong)
                ? t("possibleDuplicate")
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <StatusChip status={o.status} />
      </div>
    </li>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>{t("review")}</PageTitle>
        <SupportingText>
          {t("checkEachSubmissionAgainstThePhotos")}
        </SupportingText>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          {t("waitingForYou", { length: waiting.length })}
        </h2>
        {waiting.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("nothingToReview")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">{waiting.map(row)}</ul>
        )}
      </section>
      {done.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("decided")}</h2>
          <ul className="flex flex-col gap-3">{done.map(row)}</ul>
        </section>
      ) : null}
    </div>
  );
}
