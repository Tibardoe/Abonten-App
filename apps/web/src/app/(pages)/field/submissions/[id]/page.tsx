import { getFieldOpsOnboardingDetail } from "@/actions/fieldOps/getFieldOpsOnboardingDetail";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/typography";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import OnboardingDetailView from "@/fieldOps/organisms/OnboardingDetailView";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FieldSubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await loadFieldOpsMe();
  const current = me.data?.current;
  if (!current) notFound();
  if (current.isLead) redirect(`/field/lead/review/${id}`);

  const res = await getFieldOpsOnboardingDetail({
    campaignId: current.campaign.id,
    onboardingId: id,
  });
  if (res.status !== 200 || !res.data) notFound();
  const status = res.data.onboarding.status;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle>
          {res.data.onboarding.businessName ?? "Onboarding"}
        </PageTitle>
        {status === "draft" || status === "needs_changes" ? (
          <Button asChild size="sm">
            <Link href={`/field/onboard/${id}`}>
              {status === "needs_changes" ? "Fix and resubmit" : "Continue"}
            </Link>
          </Button>
        ) : null}
      </div>
      <OnboardingDetailView detail={res.data} viewer="member" />
      <Link
        href="/field/submissions"
        className="text-sm text-primary hover:underline"
      >
        All submissions
      </Link>
    </div>
  );
}
