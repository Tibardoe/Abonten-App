import { getFieldOpsLeadDashboard } from "@/actions/fieldOps/getFieldOpsLeadDashboard";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import StatTile from "@/fieldOps/atoms/StatTile";
import StatusChip from "@/fieldOps/atoms/StatusChip";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import CampaignBanner from "@/fieldOps/molecules/CampaignBanner";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FieldLeadDashboardPage() {
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
        <PageTitle>Team dashboard</PageTitle>
        <SupportingText>{d.today}</SupportingText>
      </div>

      <CampaignBanner campaign={d.campaign} membership={current.membership} />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Coverage" value={`${d.coveragePct}%`} />
        <StatTile label="Territories" value={d.territories.length} />
        <StatTile label="Working today" value={d.todayAssignments.length} />
        <StatTile
          label="Active members"
          value={d.team.active}
          hint={d.team.invited > 0 ? `${d.team.invited} invited` : undefined}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Coverage board</h2>
          <Link
            href="/field/lead/territories"
            className="text-sm text-primary hover:underline"
          >
            Manage territories
          </Link>
        </div>
        {d.territories.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            No territories yet. Add the towns your team will cover.
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {d.territories.map((t) => (
              <li key={t.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/field/territory/${t.id}`}
                    className="font-medium hover:underline"
                  >
                    {t.name}
                  </Link>
                  <StatusChip status={t.coverage} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.prospectCount} businesses logged
                </p>
                {t.openAssignments.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-sm">
                    {t.openAssignments.map((a) => (
                      <li key={a.id} className="flex justify-between gap-2">
                        <span>
                          {a.memberName ?? "Member"} ·{" "}
                          {a.mode === "offline" ? "in person" : "online"}
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
          <h2 className="text-lg font-semibold">Today&apos;s assignments</h2>
          <Link
            href="/field/lead/assignments"
            className="text-sm text-primary hover:underline"
          >
            Plan assignments
          </Link>
        </div>
        {d.todayAssignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody is assigned today.
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
                    {a.memberName ?? "Member"}
                  </span>{" "}
                  · {a.territoryName}
                  {a.status === "started" && a.startDistanceM !== null
                    ? ` · checked in ${Math.round(a.startDistanceM / 100) / 10} km from centre`
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
