import PageHeader from "@/components/molecules/PageHeader";
import IdentityReturnToApp from "@/identity/organisms/IdentityReturnToApp";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("identity");
  return { title: t("doneTitle"), robots: { index: false, follow: false } };
}

// Where the identity provider sends someone who started in the app: the
// app's browser has no website session, so this page only hands them back
// (abonten://settings/identity). It shows nothing about the attempt.
export default async function page() {
  const t = await getTranslations("identity");
  return (
    <div className="flex w-full flex-col gap-8">
      <PageHeader title={t("doneTitle")} />
      <Suspense fallback={null}>
        <IdentityReturnToApp />
      </Suspense>
    </div>
  );
}
