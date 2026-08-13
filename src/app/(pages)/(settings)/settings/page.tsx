import { userSubscription } from "@/actions/getUserSubscription";
import MaskIcon from "@/components/atoms/MaskIcon";
import DetailsContainer from "@/settings/atoms/DetailsContainer";
import SettingsDesktopSideBar from "@/settings/organisms/SettingsDesktopSidebar";

import Link from "next/link";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function page() {
  const subscription = await userSubscription();

  return (
    <>
      <div className="w-full flex md:hidden">
        <SettingsDesktopSideBar />
      </div>

      <div className="w-full flex-col gap-14 hidden lg:flex">
        <div className="space-y-2">
          <h1>Plan Details</h1>
          <DetailsContainer>
            {subscription.status === 200 ? (
              <div>
                <h2 className="font-medium text-lg md:text-xl">
                  {subscription.data?.subscription_plan.name}
                </h2>

                {subscription.data?.subscription_plan.name === "Daily" && (
                  <p>Post 2 flyers and unlimited stories</p>
                )}

                {subscription.data?.subscription_plan.name === "Weekly" && (
                  <p>Post 5 flyers and unlimited stories</p>
                )}

                {subscription.data?.subscription_plan.name === "Monthly" && (
                  <p>Post 10 flyers and unlimited stories</p>
                )}

                {subscription.data?.subscription_plan.name === "Unlimited" && (
                  <p>Post unlimited flyers and stories</p>
                )}
              </div>
            ) : (
              <div>
                <h2 className="font-medium text-lg md:text-xl">
                  No active subscription found
                </h2>

                <p>
                  Purchase a subscription to post flyers, stories and highlight
                </p>
              </div>
            )}

            <hr />

            <div className="flex justify-between items-center">
              <p className="font-medium">Manage plan</p>
              <Link href="/settings/membership">
                <MaskIcon
                  src="/assets/images/arrowRight.svg"
                  alt="Arrow right"
                  className="w-[30px] h-[30px]"
                />
              </Link>
            </div>
          </DetailsContainer>
        </div>

        <div className="space-y-2">
          <h1>Quick Links</h1>

          <DetailsContainer>
            <div className="flex justify-between items-center">
              <p className="font-medium text-lg">Change plan</p>
              <Link href="/plans">
                <MaskIcon
                  src="/assets/images/arrowRight.svg"
                  alt="Arrow right"
                  className="w-[30px] h-[30px]"
                />
              </Link>
            </div>

            <hr />

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
          </DetailsContainer>
        </div>
      </div>
    </>
  );
}
