import { userSubscription } from "@/actions/getUserSubscription";
import MobileSettingsHeaderNav from "@/components/molecules/MobileSettingsHeaderNav";
import DetailsContainer from "@/settings/atoms/DetailsContainer";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function page() {
  const [subscription, t] = await Promise.all([
    userSubscription(),
    getTranslations("settings"),
  ]);

  return (
    <div className="w-full flex flex-col gap-10">
      <MobileSettingsHeaderNav title={t("nav.membership")} />

      <div className="space-y-2">
        <h1>Plan Details</h1>
        <DetailsContainer>
          {/* <div>
            <h2 className="font-bold text-lg md:text-xl">{subscription.data?.subscription_plan.name}</h2>
            <p>Post unlimited flyers and stories</p>
          </div> */}
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
            <p className="font-medium">Change plan</p>
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
        </DetailsContainer>
      </div>

      <div className="space-y-2 mb-5">
        <h1>Payment Info</h1>

        <DetailsContainer>
          <div className="flex justify-between items-center">
            <div className="flex flex-col gap-3">
              <p className="font-medium md:text-lg">Next payment</p>
              <p>28 Febuary 2025</p>
              <div className="flex gap-3 items-center">
                <Image
                  src="/assets/images/visa.svg"
                  alt="Visa icon"
                  width={40}
                  height={40}
                />
                <p>**** **** **** 2746</p>
              </div>
            </div>
          </div>

          <hr />

          <div className="flex justify-between items-center">
            <p className="font-medium md:text-lg">Manage payment method</p>
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
        </DetailsContainer>

        <button
          type="button"
          className="w-full text-destructive font-bold p-3 border border-border rounded-md"
        >
          Cancel Membership
        </button>
      </div>
    </div>
  );
}
