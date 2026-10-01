import { getFieldOpsLeadDashboard } from "@/actions/fieldOps/getFieldOpsLeadDashboard";
import { listFieldOpsLeadAssignments } from "@/actions/fieldOps/listFieldOpsLeadAssignments";
import { listFieldOpsLeadTerritories } from "@/actions/fieldOps/listFieldOpsLeadTerritories";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import LeadAssignmentPlanner from "@/fieldOps/organisms/LeadAssignmentPlanner";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const PLANNING = new Set(["draft", "active"]);

export default async function FieldLeadAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const me = await loadFieldOpsMe();
  const current = me.data?.current;
  if (!current?.isLead) notFound();

  const { date: rawDate } = await searchParams;
  const date =
    rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : current.today;
  const campaignId = current.campaign.id;
  const [assignments, dashboard, territories] = await Promise.all([
    listFieldOpsLeadAssignments({ campaignId, date }),
    getFieldOpsLeadDashboard({ campaignId }),
    listFieldOpsLeadTerritories({ campaignId }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>Assignments</PageTitle>
        <SupportingText>
          Who works which town on which days. Reassigning is cancel + assign, so
          the history stays complete.
        </SupportingText>
      </div>
      <LeadAssignmentPlanner
        campaignId={campaignId}
        date={date}
        today={current.today}
        assignments={assignments.data ?? []}
        members={dashboard.data?.assignableMembers ?? []}
        territories={territories.data ?? []}
        canPlan={
          current.membership.status === "active" &&
          PLANNING.has(current.campaign.status)
        }
      />
    </div>
  );
}
