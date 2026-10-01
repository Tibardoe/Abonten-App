import { getOrganizerLedgerTransactions } from "@/actions/getOrganizerLedgerTransactions";
import FinancesTransactionsList from "@/finances/organisms/FinancesTransactionsList";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("finances");
  return { title: t("financeTransactions") };
}

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function FinancesTransactionsPage() {
  const t = await getTranslations("finances");

  const firstPage = await getOrganizerLedgerTransactions();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-bold md:text-lg">{t("transactions")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("everyTicketSaleFeeRefundAnd")}
        </p>
      </div>

      <FinancesTransactionsList initialPage={firstPage} />
    </div>
  );
}
