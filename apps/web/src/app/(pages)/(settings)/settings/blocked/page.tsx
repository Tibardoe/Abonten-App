import PageHeader from "@/components/molecules/PageHeader";
import BlockedAccountsList from "@/settings/organisms/BlockedAccountsList";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = { title: "Blocked accounts" };

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function page() {
  const t = await getTranslations("settings");
  return (
    <div className="w-full flex flex-col gap-10">
      <PageHeader title={t("nav.blockedAccounts")} showBackButton />
      <BlockedAccountsList />
    </div>
  );
}
