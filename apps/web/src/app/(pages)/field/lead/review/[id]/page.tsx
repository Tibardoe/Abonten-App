import { getFieldOpsOnboardingDetail } from "@/actions/fieldOps/getFieldOpsOnboardingDetail";
import { PageTitle } from "@/components/ui/typography";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import OnboardingDetailView from "@/fieldOps/organisms/OnboardingDetailView";
import ReviewDecisionForm from "@/fieldOps/organisms/ReviewDecisionForm";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const REVIEWING = new Set(["active", "paused", "winding_down", "completed"]);

export default async function FieldLeadReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await loadFieldOpsMe();
  const current = me.data?.current;
  if (!current?.isLead) notFound();

  const res = await getFieldOpsOnboardingDetail({
    campaignId: current.campaign.id,
    onboardingId: id,
  });
  if (res.status !== 200 || !res.data) notFound();
  const canDecide =
    res.data.onboarding.status === "submitted" &&
    current.membership.status === "active" &&
    REVIEWING.has(current.campaign.status);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>{res.data.onboarding.businessName ?? "Onboarding"}</PageTitle>
      <OnboardingDetailView detail={res.data} viewer="lead" />
      {canDecide ? (
        <ReviewDecisionForm
          campaignId={current.campaign.id}
          onboardingId={id}
        />
      ) : null}
      <Link
        href="/field/lead/review"
        className="text-sm text-primary hover:underline"
      >
        Back to the queue
      </Link>
    </div>
  );
}
