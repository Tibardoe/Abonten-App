import PageHeader from "@/components/molecules/PageHeader";
import BalanceView from "@/ticketPlans/organisms/BalanceView";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ticketPlans");
  return { title: t("balance") };
}

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// Money put towards tickets on Pay small small plans, and Abonten Credit
// for people who can see Rewards — side by side, never added together.
export default async function page() {
  const t = await getTranslations("ticketPlans");
  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title={t("balance")} showBackButton />
      <Suspense fallback={null}>
        <BalanceView />
      </Suspense>
    </div>
  );
}
