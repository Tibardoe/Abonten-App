import { listFieldOpsLeadTeam } from "@/actions/fieldOps/listFieldOpsLeadTeam";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import LeadTeamPanel from "@/fieldOps/organisms/LeadTeamPanel";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const MANAGEABLE = new Set(["draft", "active", "paused"]);

export default async function FieldLeadTeamPage() {
  const me = await loadFieldOpsMe();
  const current = me.data?.current;
  if (!current?.isLead) notFound();

  const res = await listFieldOpsLeadTeam({ campaignId: current.campaign.id });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>Team</PageTitle>
        <SupportingText>
          Everyone on {current.campaign.name}. Payout details are handled by the
          finance team, not here.
        </SupportingText>
      </div>
      <LeadTeamPanel
        campaignId={current.campaign.id}
        members={res.data ?? []}
        canManage={
          current.membership.status === "active" &&
          MANAGEABLE.has(current.campaign.status)
        }
      />
    </div>
  );
}
