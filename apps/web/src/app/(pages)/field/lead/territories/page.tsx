import { listFieldOpsLeadTerritories } from "@/actions/fieldOps/listFieldOpsLeadTerritories";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import LeadTerritoryList from "@/fieldOps/organisms/LeadTerritoryList";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const EDITABLE = new Set(["draft", "active", "paused", "winding_down"]);

export default async function FieldLeadTerritoriesPage() {
  const me = await loadFieldOpsMe();
  const current = me.data?.current;
  if (!current?.isLead) notFound();

  const res = await listFieldOpsLeadTerritories({
    campaignId: current.campaign.id,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>Territories</PageTitle>
        <SupportingText>
          The towns and areas of {current.campaign.regionName} your team covers.
          Mark one completed once it has been worked through.
        </SupportingText>
      </div>
      <LeadTerritoryList
        campaignId={current.campaign.id}
        territories={res.data ?? []}
        editable={
          current.membership.status === "active" &&
          EDITABLE.has(current.campaign.status)
        }
      />
    </div>
  );
}
