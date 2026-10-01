import MaskIcon from "@/components/atoms/MaskIcon";
import PageHeader from "@/components/molecules/PageHeader";
import DetailsContainer from "@/settings/atoms/DetailsContainer";
import PromotionDetails from "@/settings/organisms/PromotionDetails";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function page() {
  const t = await getTranslations("settings");

  return (
    <div className="w-full flex flex-col gap-10">
      <PageHeader title={t("nav.overview")} showBackButton />

      <PromotionDetails />

      <div className="space-y-2">
        <h1>{t("quickLinks")}</h1>

        <DetailsContainer>
          <div className="flex justify-between items-center">
            <p className="font-medium md:text-lg">{t("managePaymentMethod")}</p>
            <Link href="/wallet">
              <MaskIcon
                src="/assets/images/arrowRight.svg"
                alt={t("arrowRight")}
                className="w-6 h-6 md:w-8 md:h-8"
              />
            </Link>
          </div>

          <hr />

          <div className="flex justify-between items-center">
            <p className="font-medium md:text-lg">
              {t("viewTransactionHistory")}
            </p>
            <Link href="/transactions">
              <MaskIcon
                src="/assets/images/arrowRight.svg"
                alt={t("arrowRight")}
                className="w-6 h-6 md:w-8 md:h-8"
              />
            </Link>
          </div>
        </DetailsContainer>
      </div>
    </div>
  );
}
