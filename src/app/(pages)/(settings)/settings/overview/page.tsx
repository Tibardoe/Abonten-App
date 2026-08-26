import MaskIcon from "@/components/atoms/MaskIcon";
import MobileSettingsHeaderNav from "@/components/molecules/MobileSettingsHeaderNav";
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
      <MobileSettingsHeaderNav title={t("nav.overview")} />

      <PromotionDetails />

      <div className="space-y-2">
        <h1>Quick Links</h1>

        <DetailsContainer>
          <div className="flex justify-between items-center">
            <p className="font-medium md:text-lg">Manage payment method</p>
            <Link href="/wallet">
              <MaskIcon
                src="/assets/images/arrowRight.svg"
                alt="Arrow right"
                className="w-6 h-6 md:w-8 md:h-8"
              />
            </Link>
          </div>

          <hr />

          <div className="flex justify-between items-center">
            <p className="font-medium md:text-lg">View transaction history</p>
            <Link href="/transactions">
              <MaskIcon
                src="/assets/images/arrowRight.svg"
                alt="Arrow right"
                className="w-6 h-6 md:w-8 md:h-8"
              />
            </Link>
          </div>
        </DetailsContainer>
      </div>
    </div>
  );
}
