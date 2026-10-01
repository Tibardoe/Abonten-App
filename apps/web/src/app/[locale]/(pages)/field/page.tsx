import { PageTitle, SupportingText } from "@/components/ui/typography";
import StatTile from "@/fieldOps/atoms/StatTile";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import AssignmentCard from "@/fieldOps/molecules/AssignmentCard";
import CampaignBanner from "@/fieldOps/molecules/CampaignBanner";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

// Per-user, request-time data -- same force-dynamic precedent as /rewards.
export const dynamic = "force-dynamic";

export default async function FieldTodayPage() {
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
        <PageTitle>Today</PageTitle>
        <SupportingText>{today}</SupportingText>
      </div>

      <CampaignBanner campaign={campaign} membership={membership} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Your assignments today</h2>
        {todayAssignments.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Nothing assigned for today. Your team lead sets assignments; you
            will get a notification when one arrives.
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
          All assignments
        </Link>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Open assignments" value={stats.openAssignments} />
        <StatTile label="Completed" value={stats.completedAssignments} />
        <StatTile label="Businesses logged" value={stats.prospects} />
        <StatTile label="Contacted" value={stats.prospectsContacted} />
      </section>

      <section className="rounded-xl border p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">How it works</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Start today&apos;s assignment when you arrive in the town.</li>
          <li>
            Open the territory and log every business or organizer you speak to,
            with how it went.
          </li>
          <li>
            When an owner is ready, start the onboarding from the territory
            page: the owner confirms the code sent to their phone, you fill in
            the business details and photos, and your team lead reviews it.
          </li>
          <li>
            Once it is verified and the holding period has passed, the
            commission moves to &quot;ready to pay&quot; on your Earnings page.
          </li>
        </ol>
      </section>
    </div>
  );
}
