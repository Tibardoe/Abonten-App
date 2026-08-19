import getOrganizerPayouts from "@/actions/getOrganizerPayouts";
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
        <h2 className="font-bold md:text-lg">Payouts</h2>
        <p className="text-sm text-muted-foreground">
          Your withdrawal history and status.
        </p>
      </div>

      <FinancesPayoutsList initialPayouts={payouts} />
    </div>
  );
}
