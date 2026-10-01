import { PageTitle, SupportingText } from "@/components/ui/typography";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import AnnouncementForm from "@/fieldOps/organisms/AnnouncementForm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FieldLeadAnnouncePage() {
  const me = await loadFieldOpsMe();
  const current = me.data?.current;
  if (!current?.isLead) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>Announce</PageTitle>
        <SupportingText>
          Every active member gets it as a notification and a push on their
          phone.
        </SupportingText>
      </div>
      <AnnouncementForm campaignId={current.campaign.id} />
    </div>
  );
}
