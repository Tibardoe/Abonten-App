import { PageTitle, SupportingText } from "@/components/ui/typography";
import StatTile from "@/fieldOps/atoms/StatTile";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import AssignmentCard from "@/fieldOps/molecules/AssignmentCard";
import CampaignBanner from "@/fieldOps/molecules/CampaignBanner";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

// Per-user, request-time data -- same force-dynamic precedent as /rewards.
export const dynamic = "force-dynamic";

export default async function FieldTodayPage() {
  const t = await getTranslations("fieldOps");

  const me = await loadFieldOpsMe();
  const current = me.data?.current;
  if (!current) notFound();
  // Leads plan; their home is the dashboard.
  if (current.isLead) redirect("/field/lead");

  const { campaign, membership, todayAssignments, stats, today } = current;
  const canAct = membership.status === "active" && campaign.status === "active";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>{t("today")}</PageTitle>
        <SupportingText>{today}</SupportingText>
      </div>

      <CampaignBanner campaign={campaign} membership={membership} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("yourAssignmentsToday")}</h2>
        {todayAssignments.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            {t("nothingAssignedForTodayYourTeam")}
          </p>
        ) : (
          todayAssignments.map((a) => (
            <AssignmentCard
              key={a.id}
              assignment={a}
              canAct={canAct}
              today={today}
            />
          ))
        )}
        <Link
          href="/field/assignments"
          className="text-sm text-primary hover:underline"
        >
          {t("allAssignments")}
        </Link>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={t("openAssignments")} value={stats.openAssignments} />
        <StatTile label={t("completed")} value={stats.completedAssignments} />
        <StatTile label={t("businessesLogged2")} value={stats.prospects} />
        <StatTile label={t("contacted")} value={stats.prospectsContacted} />
      </section>

      <section className="rounded-xl border p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{t("howItWorks")}</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>{t("startTodaySAssignmentWhenYou")}</li>
          <li>{t("openTheTerritoryAndLogEvery")}</li>
          <li>{t("whenAnOwnerIsReadyStart")}</li>
          <li>{t("onceItIsVerifiedAndThe")}</li>
        </ol>
      </section>
    </div>
  );
}
