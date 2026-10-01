import getOrganizerPayouts from "@/actions/getOrganizerPayouts";
import { SectionTitle, SupportingText } from "@/components/ui/typography";
import FinancesPayoutsList from "@/finances/organisms/FinancesPayoutsList";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("finances");
  return { title: t("payouts") };
}

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function FinancesPayoutsPage() {
  const t = await getTranslations("finances");

  const response = await getOrganizerPayouts();
  const payouts = response.status === 200 ? response.data : [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionTitle>{t("payouts")}</SectionTitle>
        <SupportingText>{t("yourWithdrawalHistoryAndStatus")}</SupportingText>
      </div>

      <FinancesPayoutsList initialPayouts={payouts} />
    </div>
  );
}
