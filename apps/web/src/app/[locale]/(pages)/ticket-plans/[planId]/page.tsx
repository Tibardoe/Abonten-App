import PageHeader from "@/components/molecules/PageHeader";
import TicketPlanView from "@/ticketPlans/organisms/TicketPlanView";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ticketPlans");
  return { title: t("paySmallSmall") };
}

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// One of the signed-in buyer's plans (docs/architecture/ticket-plans.md).
// Everything is read client-side through the plan's own action, so a
// payment's return (?attempt=…) can be confirmed right here.
export default async function page({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  const t = await getTranslations("ticketPlans");
  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title={t("paySmallSmall")} showBackButton />
      <Suspense fallback={null}>
        <TicketPlanView planId={planId} />
      </Suspense>
    </div>
  );
}
