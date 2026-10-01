import { getFieldOpsConsentView } from "@/actions/fieldOps/getFieldOpsConsentView";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import ConsentForm from "@/fieldOps/organisms/ConsentForm";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

// Public page a business owner opens from the link an online team member
// sent them. No account needed: the signed token in the URL identifies the
// onboarding, the SMS code proves the phone.
export default async function FieldConsentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const t = await getTranslations("fieldOps");

  const { token } = await params;
  const res = await getFieldOpsConsentView(token);
  if (res.status !== 200 || !res.data) notFound();
  const v = res.data;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <div>
        <PageTitle>
          {t("listBusinessOnAbonten", {
            name: v.businessName ?? t("yourBusiness"),
          })}
        </PageTitle>
        <SupportingText>
          {t("teamMemberIsAddingYourBusiness", {
            phone: v.ownerPhoneMasked ?? t("yourPhone"),
          })}
        </SupportingText>
      </div>
      {v.verified ? (
        <p className="rounded-xl border bg-emerald-500/10 p-4 text-sm">
          {t("alreadyConfirmedThankYou")}
        </p>
      ) : v.expired ? (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">
          {t("thisLinkHasExpiredAskThe")}
        </p>
      ) : (
        <ConsentForm token={token} />
      )}
      <p className="text-xs text-muted-foreground">
        {t.rich("byEnteringTheCodeYouAgree", {
          link: (chunks) => (
            <Link href="/legal/terms" className="underline underline-offset-4">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </div>
  );
}
