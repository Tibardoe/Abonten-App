import { getFieldOpsConsentView } from "@/actions/fieldOps/getFieldOpsConsentView";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import ConsentForm from "@/fieldOps/organisms/ConsentForm";
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
  const { token } = await params;
  const res = await getFieldOpsConsentView(token);
  if (res.status !== 200 || !res.data) notFound();
  const v = res.data;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <div>
        <PageTitle>
          List {v.businessName ?? "your business"} on Abonten
        </PageTitle>
        <SupportingText>
          An Abonten team member is adding your business to Abonten, where
          people nearby find places to go. Enter the code we sent to{" "}
          {v.ownerPhoneMasked ?? "your phone"} to agree. The listing will belong
          to you: sign in with this phone any time to manage it.
        </SupportingText>
      </div>
      {v.verified ? (
        <p className="rounded-xl border bg-emerald-500/10 p-4 text-sm">
          Already confirmed. Thank you.
        </p>
      ) : v.expired ? (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">
          This link has expired. Ask the team member to send a new code.
        </p>
      ) : (
        <ConsentForm token={token} />
      )}
      <p className="text-xs text-muted-foreground">
        By entering the code you agree to list your business on Abonten and to
        the{" "}
        <Link href="/legal/terms" className="underline underline-offset-4">
          Abonten Terms and Conditions
        </Link>
        . Nothing is charged.
      </p>
    </div>
  );
}
