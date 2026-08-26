import getOrganizerPayouts from "@/actions/getOrganizerPayouts";
import { SectionTitle, SupportingText } from "@/components/ui/typography";
import FinancesPayoutsList from "@/finances/organisms/FinancesPayoutsList";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function FinancesPayoutsPage() {
  const response = await getOrganizerPayouts();
  const payouts = response.status === 200 ? response.data : [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionTitle>Payouts</SectionTitle>
        <SupportingText>Your withdrawal history and status.</SupportingText>
      </div>

      <FinancesPayoutsList initialPayouts={payouts} />
    </div>
  );
}
