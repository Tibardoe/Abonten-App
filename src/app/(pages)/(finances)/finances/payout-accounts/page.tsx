import getOrganizerPayoutAccounts from "@/actions/getOrganizerPayoutAccounts";
import PayoutAccountManager from "@/finances/organisms/PayoutAccountManager";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function PayoutAccountsPage() {
  const response = await getOrganizerPayoutAccounts();
  const accounts = response.status === 200 ? response.data : [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-bold md:text-lg">Payout Accounts</h2>
        <p className="text-sm text-muted-foreground">
          Accounts you receive your Abonten earnings on — separate from any card
          or mobile money wallet you use to pay for tickets.
        </p>
      </div>

      <PayoutAccountManager initialAccounts={accounts} />
    </div>
  );
}
