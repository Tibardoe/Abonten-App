import PageHeader from "@/components/molecules/PageHeader";
import TestIdentityProvider from "@/identity/organisms/TestIdentityProvider";
import { testIdentityProviderAllowed } from "@abonten/services/identity/providers/registry";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("identity");
  return { title: t("testTitle"), robots: { index: false, follow: false } };
}

// The stand-in identity provider's "hosted page", for local and Preview QA:
// the tester picks the verdict a real provider would send. Never on the
// production deployment or database (testIdentityProviderAllowed).
export default async function page() {
  if (!testIdentityProviderAllowed()) notFound();
  const t = await getTranslations("identity");
  return (
    <div className="flex w-full flex-col gap-8">
      <PageHeader title={t("testTitle")} showBackButton />
      <Suspense fallback={null}>
        <TestIdentityProvider />
      </Suspense>
    </div>
  );
}
