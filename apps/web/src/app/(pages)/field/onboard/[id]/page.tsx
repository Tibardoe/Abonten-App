import { getFieldOpsOnboardingDraft } from "@/actions/fieldOps/getFieldOpsOnboardingDraft";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import OnboardingWizard from "@/fieldOps/organisms/OnboardingWizard";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FieldOnboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await loadFieldOpsMe();
  const current = me.data?.current;
  if (!current || current.isLead) notFound();

  const res = await getFieldOpsOnboardingDraft({
    campaignId: current.campaign.id,
    onboardingId: id,
  });
  if (res.status !== 200 || !res.data) notFound();
  const status = res.data.onboarding.status;
  if (status !== "draft" && status !== "needs_changes") {
    redirect(`/field/submissions/${id}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>Onboard a business</PageTitle>
        <SupportingText>
          {res.data.onboarding.territoryName ?? current.campaign.regionName} ·{" "}
          {res.data.onboarding.mode === "offline" ? "in person" : "online"}
        </SupportingText>
      </div>
      <OnboardingWizard campaignId={current.campaign.id} draft={res.data} />
    </div>
  );
}
