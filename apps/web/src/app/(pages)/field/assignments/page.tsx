import { listMyFieldOpsAssignments } from "@/actions/fieldOps/listMyFieldOpsAssignments";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import AssignmentCard from "@/fieldOps/molecules/AssignmentCard";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FieldAssignmentsPage() {
  const me = await loadFieldOpsMe();
  const current = me.data?.current;
  if (!current) notFound();
  if (current.isLead) redirect("/field/lead/assignments");

  const res = await listMyFieldOpsAssignments({
    campaignId: current.campaign.id,
  });
  const all = res.data ?? [];
  const open = all.filter(
    (a) => a.status === "assigned" || a.status === "started",
  );
  const closed = all.filter(
    (a) => a.status === "completed" || a.status === "cancelled",
  );
  const canAct =
    current.membership.status === "active" &&
    current.campaign.status === "active";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>Assignments</PageTitle>
        <SupportingText>
          Where you&apos;re working, and where you have been.
        </SupportingText>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Open</h2>
        {open.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open assignments.</p>
        ) : (
          open.map((a) => (
            <AssignmentCard
              key={a.id}
              assignment={a}
              canAct={canAct}
              today={current.today}
            />
          ))
        )}
      </section>

      {closed.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">History</h2>
          {closed.map((a) => (
            <AssignmentCard
              key={a.id}
              assignment={a}
              canAct={false}
              today={current.today}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
