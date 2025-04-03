import DetailsContainer from "@/settings/atoms/DetailsContainer";
import SettingsDesktopSideBar from "@/settings/organisms/SettingsDesktopSidebar";
import { userSubscription } from "@/actions/getUserSubscription";

import Image from "next/image";
import Link from "next/link";

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
                <h2 className="font-bold text-lg md:text-xl">
                  {subscription.data?.subscription_plan[0].name}
                </h2>

                {subscription.data?.subscription_plan[0].name === "Daily" && (
                  <p>Post 2 flyers and unlimited stories</p>
                )}

                {subscription.data?.subscription_plan[0].name === "Weekly" && (
                  <p>Post 5 flyers and unlimited stories</p>
                )}

                {subscription.data?.subscription_plan[0].name === "Monthly" && (
                  <p>Post 10 flyers and unlimited stories</p>
                )}

                {subscription.data?.subscription_plan[0].name ===
                  "Unlimited" && <p>Post unlimited flyers and stories</p>}
              </div>
            ) : (
              <div>
                <h2 className="font-bold text-lg md:text-xl">
                  No active subscription found
                </h2>

                <p>
                  Purchase a subscription to post flyers, stories and highlight
                </p>
              </div>
            )}

            <hr />

            <div className="flex justify-between items-center">
              <p className="font-bold">Manage plan</p>
              <Link href="/settings/membership">
                <Image
                  src="/assets/images/arrowRight.svg"
                  alt="Arrow right"
                  width={30}
                  height={30}
                />
              </Link>
            </div>
          </DetailsContainer>
        </div>

        <div className="space-y-2">
          <h1>Quick Links</h1>

          <DetailsContainer>
            <div className="flex justify-between items-center">
              <p className="font-bold text-lg">Change plan</p>
              <Link href="/plans">
                <Image
                  src="/assets/images/arrowRight.svg"
                  alt="Arrow right"
                  width={30}
                  height={30}
                />
              </Link>
            </div>

            <hr />

            <div className="flex justify-between items-center">
              <p className="font-bold text-lg">Manage payment method</p>
              <Link href="/wallet">
                <Image
                  src="/assets/images/arrowRight.svg"
                  alt="Arrow right"
                  width={30}
                  height={30}
                />
              </Link>
            </div>
          </DetailsContainer>
        </div>
      </div>
    </>
  );
}
