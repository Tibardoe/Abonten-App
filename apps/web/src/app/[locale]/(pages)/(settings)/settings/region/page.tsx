import PageHeader from "@/components/molecules/PageHeader";
import RegionAndCurrency from "@/settings/organisms/RegionAndCurrency";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = { title: "Region and currency" };

export default async function page() {
  const t = await getTranslations("settings");
  return (
    <div className="w-full flex flex-col gap-10">
      <PageHeader title={t("nav.region")} showBackButton />
      <RegionAndCurrency />
    </div>
  );
}
