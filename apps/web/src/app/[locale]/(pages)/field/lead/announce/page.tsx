import { PageTitle, SupportingText } from "@/components/ui/typography";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import AnnouncementForm from "@/fieldOps/organisms/AnnouncementForm";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FieldLeadAnnouncePage() {
  const t = await getTranslations("fieldOps");

  const me = await loadFieldOpsMe();
  const current = me.data?.current;
  if (!current?.isLead) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>{t("announce")}</PageTitle>
        <SupportingText>{t("everyActiveMemberGetsItAs")}</SupportingText>
      </div>
      <AnnouncementForm campaignId={current.campaign.id} />
    </div>
  );
}
