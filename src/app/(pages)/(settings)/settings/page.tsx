import MaskIcon from "@/components/atoms/MaskIcon";
import DetailsContainer from "@/settings/atoms/DetailsContainer";
import PromotionDetails from "@/settings/organisms/PromotionDetails";
import SettingsDesktopSideBar from "@/settings/organisms/SettingsDesktopSidebar";

import Link from "next/link";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default function page() {
  return (
    <>
      <div className="w-full flex md:hidden">
        <SettingsDesktopSideBar />
      </div>

      <div className="w-full flex-col gap-14 hidden lg:flex">
        <PromotionDetails />

        <div className="space-y-2">
          <h1>Quick Links</h1>

          <DetailsContainer>
            <div className="flex justify-between items-center">
              <p className="font-medium text-lg">Manage payment method</p>
              <Link href="/wallet">
                <MaskIcon
                  src="/assets/images/arrowRight.svg"
                  alt="Arrow right"
                  className="w-[30px] h-[30px]"
                />
              </Link>
            </div>

            <hr />

            <div className="flex justify-between items-center">
              <p className="font-medium text-lg">View transaction history</p>
              <Link href="/transactions">
                <MaskIcon
                  src="/assets/images/arrowRight.svg"
                  alt="Arrow right"
                  className="w-[30px] h-[30px]"
                />
              </Link>
            </div>
          </DetailsContainer>
        </div>
      </div>
    </>
  );
}
