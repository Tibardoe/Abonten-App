import { listFieldOpsLeadTeam } from "@/actions/fieldOps/listFieldOpsLeadTeam";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import LeadTeamPanel from "@/fieldOps/organisms/LeadTeamPanel";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const MANAGEABLE = new Set(["draft", "active", "paused"]);

export default async function FieldLeadTeamPage() {
  const t = await getTranslations("fieldOps");

  const me = await loadFieldOpsMe();
  const current = me.data?.current;
  if (!current?.isLead) notFound();

  const res = await listFieldOpsLeadTeam({ campaignId: current.campaign.id });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>{t("team")}</PageTitle>
        <SupportingText>
          {t("everyoneOnPayoutDetailsAreHandled", {
            name: current.campaign.name,
          })}
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
