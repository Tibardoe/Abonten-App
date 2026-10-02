import getOrganizerFinanceOverview from "@/actions/getOrganizerFinanceOverview";
import FinancesOverview from "@/finances/organisms/FinancesOverview";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function FinancesOverviewPage() {
  const response = await getOrganizerFinanceOverview();
  // Not read: the component loads it itself and says so if it cannot.
  const overview = response.status === 200 ? response.data : undefined;

  return <FinancesOverview initialOverview={overview} />;
}
