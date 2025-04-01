import { userSubscription } from "@/actions/getUserSubscription";
import MobileSettingsHeaderNav from "@/components/molecules/MobileSettingsHeaderNav";
import DetailsContainer from "@/settings/atoms/DetailsContainer";
import type { SubscriptionType } from "@/types/subscriptionType";
import Image from "next/image";
import Link from "next/link";

export default async function page() {
  const subscription: SubscriptionType = await userSubscription();

  console.log(subscription);

  return (
    <div className="w-full flex flex-col gap-10">
      <MobileSettingsHeaderNav title="Overview" />

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

              {subscription.data?.subscription_plan[0].name === "Unlimited" && (
                <p>Post unlimited flyers and stories</p>
              )}
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
                className="w-6 h-6 md:w-8 md:h-8"
              />
            </Link>
          </div>
        </DetailsContainer>
      </div>

      <div className="space-y-2">
        <h1>Quick Links</h1>

        <DetailsContainer>
          <div className="flex justify-between items-center">
            <p className="font-bold md:text-lg">Change plan</p>
            <Link href="/plans">
              <Image
                src="/assets/images/arrowRight.svg"
                alt="Arrow right"
                width={30}
                height={30}
                className="w-6 h-6 md:w-8 md:h-8"
              />
            </Link>
          </div>

          <hr />

          <div className="flex justify-between items-center">
            <p className="font-bold md:text-lg">Manage payment method</p>
            <Link href="/wallet">
              <Image
                src="/assets/images/arrowRight.svg"
                alt="Arrow right"
                width={30}
                height={30}
                className="w-6 h-6 md:w-8 md:h-8"
              />
            </Link>
          </div>

          <hr />

          <div className="flex justify-between items-center">
            <p className="font-bold md:text-lg">View transaction history</p>
            <Link href="/transactions">
              <Image
                src="/assets/images/arrowRight.svg"
                alt="Arrow right"
                width={30}
                height={30}
                className="w-6 h-6 md:w-8 md:h-8"
              />
            </Link>
          </div>
        </DetailsContainer>
      </div>
    </div>
  );
}
