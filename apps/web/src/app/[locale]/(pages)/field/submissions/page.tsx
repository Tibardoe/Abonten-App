import { listMyFieldOpsOnboardings } from "@/actions/fieldOps/listMyFieldOpsOnboardings";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import StatusChip from "@/fieldOps/atoms/StatusChip";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FieldSubmissionsPage() {
  const t = await getTranslations("fieldOps");
  const format = await getFormatter();

  const me = await loadFieldOpsMe();
  const current = me.data?.current;
  if (!current) notFound();
  if (current.isLead) redirect("/field/lead/review");

  const res = await listMyFieldOpsOnboardings({
    campaignId: current.campaign.id,
  });
  const all = res.data ?? [];
  const open = all.filter((o) => ["draft", "needs_changes"].includes(o.status));
  const rest = all.filter(
    (o) => !["draft", "needs_changes"].includes(o.status),
  );

  const row = (o: (typeof all)[number]) => (
    <li key={o.id} className="rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link
            href={
              o.status === "draft" || o.status === "needs_changes"
                ? `/field/onboard/${o.id}`
                : `/field/submissions/${o.id}`
            }
            className="font-medium hover:underline"
          >
            {o.businessName ?? t("noNameYet")}
          </Link>
          <p className="text-sm text-muted-foreground">
            {o.territoryName ?? "—"} ·{" "}
            {o.submittedAt
              ? t("submitted3", {
                  date: format.dateTime(new Date(o.submittedAt), {
                    dateStyle: "medium",
                  }),
                })
              : t("started2", {
                  date: format.dateTime(new Date(o.createdAt), {
                    dateStyle: "medium",
                  }),
                })}
          </p>
        </div>
        <StatusChip status={o.status} />
      </div>
      {o.status === "needs_changes" && o.reviewNote ? (
        <p className="mt-2 text-sm">
          {t("lead", { reviewNote: o.reviewNote })}
        </p>
      ) : null}
      {o.status === "rejected" && o.rejectionReason ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("reason", { rejectionReason: o.rejectionReason })}
        </p>
      ) : null}
      {o.status === "verified" && o.holdingUntil ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("verifiedCommissionConfirmedAfter", {
            date: format.dateTime(new Date(o.holdingUntil), {
              dateStyle: "medium",
            }),
          })}
        </p>
      ) : null}
    </li>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>{t("submissions")}</PageTitle>
        <SupportingText>
          {t("businessesYouHaveOnboardedAndWhere")}
        </SupportingText>
      </div>
      {open.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("inProgress")}</h2>
          <ul className="flex flex-col gap-3">{open.map(row)}</ul>
        </section>
      ) : null}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("submitted")}</h2>
        {rest.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            {t("nothingSubmittedYetOpenATerritory")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">{rest.map(row)}</ul>
        )}
      </section>
    </div>
  );
}
