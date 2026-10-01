import { getFieldOpsOnboardingDetail } from "@/actions/fieldOps/getFieldOpsOnboardingDetail";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/typography";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import OnboardingDetailView from "@/fieldOps/organisms/OnboardingDetailView";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FieldSubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("fieldOps");

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
          {res.data.onboarding.businessName ?? t("onboarding")}
        </PageTitle>
        {status === "draft" || status === "needs_changes" ? (
          <Button asChild size="sm">
            <Link href={`/field/onboard/${id}`}>
              {status === "needs_changes"
                ? t("fixAndResubmit")
                : t("continueText")}
            </Link>
          </Button>
        ) : null}
      </div>
      <OnboardingDetailView detail={res.data} viewer="member" />
      <Link
        href="/field/submissions"
        className="text-sm text-primary hover:underline"
      >
        {t("allSubmissions")}
      </Link>
    </div>
  );
}
