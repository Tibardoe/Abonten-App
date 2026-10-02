import getOrganizerPayoutAccounts from "@/actions/getOrganizerPayoutAccounts";
import PayoutAccountManager from "@/finances/organisms/PayoutAccountManager";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("finances");
  return { title: t("payoutAccounts") };
}

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function PayoutAccountsPage() {
  const t = await getTranslations("finances");

  const response = await getOrganizerPayoutAccounts();
  // Not read: the component loads them itself and says so if it cannot.
  const accounts = response.status === 200 ? response.data : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-bold md:text-lg">{t("payoutAccounts2")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("accountsYouReceiveYourAbontenEarnings")}
        </p>
      </div>

      <PayoutAccountManager initialAccounts={accounts} />
    </div>
  );
}
