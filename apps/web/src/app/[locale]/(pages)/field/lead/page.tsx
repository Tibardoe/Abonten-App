import { getFieldOpsLeadDashboard } from "@/actions/fieldOps/getFieldOpsLeadDashboard";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import StatTile from "@/fieldOps/atoms/StatTile";
import StatusChip from "@/fieldOps/atoms/StatusChip";
import { formatDistance } from "@/fieldOps/lib/formatDistance";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import CampaignBanner from "@/fieldOps/molecules/CampaignBanner";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FieldLeadDashboardPage() {
  const t = await getTranslations("fieldOps");

  const me = await loadFieldOpsMe();
  const current = me.data?.current;
  if (!current?.isLead) notFound();

  const res = await getFieldOpsLeadDashboard({
    campaignId: current.campaign.id,
  });
  if (res.status !== 200 || !res.data) notFound();
  const d = res.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>{t("teamDashboard")}</PageTitle>
        <SupportingText>{d.today}</SupportingText>
      </div>

      <CampaignBanner campaign={d.campaign} membership={current.membership} />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={t("coverage")} value={`${d.coveragePct}%`} />
        <StatTile label={t("territories")} value={d.territories.length} />
        <StatTile label={t("workingToday")} value={d.todayAssignments.length} />
        <StatTile
          label={t("activeMembers")}
          value={d.team.active}
          hint={
            d.team.invited > 0
              ? t("invited2", { invited: d.team.invited })
              : undefined
          }
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("coverageBoard")}</h2>
          <Link
            href="/field/lead/territories"
            className="text-sm text-primary hover:underline"
          >
            {t("manageTerritories")}
          </Link>
        </div>
        {d.territories.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            {t("noTerritoriesYetAddTheTowns")}
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {d.territories.map((territory) => (
              <li key={territory.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/field/territory/${territory.id}`}
                    className="font-medium hover:underline"
                  >
                    {territory.name}
                  </Link>
                  <StatusChip status={territory.coverage} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("businessesLogged", {
                    prospectCount: territory.prospectCount,
                  })}
                </p>
                {territory.openAssignments.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-sm">
                    {territory.openAssignments.map((a) => (
                      <li key={a.id} className="flex justify-between gap-2">
                        <span>
                          {a.memberName ?? t("member")} ·{" "}
                          {a.mode === "offline" ? t("inPerson") : t("online")}
                        </span>
                        <StatusChip status={a.status} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("todaySAssignments")}</h2>
          <Link
            href="/field/lead/assignments"
            className="text-sm text-primary hover:underline"
          >
            {t("planAssignments")}
          </Link>
        </div>
        {d.todayAssignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("nobodyIsAssignedToday")}
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {d.todayAssignments.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <span>
                  <span className="font-medium">
                    {a.memberName ?? t("member")}
                  </span>{" "}
                  · {a.territoryName}
                  {a.status === "started" && a.startDistanceM !== null
                    ? t("checkedInFromCentre", {
                        formatDistance: formatDistance(a.startDistanceM),
                      })
                    : ""}
                </span>
                <StatusChip status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
