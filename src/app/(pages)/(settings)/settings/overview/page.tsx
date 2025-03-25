import BackButton from "@/components/atoms/BackButton";
import MobileSettingsHeaderNav from "@/components/molecules/MobileSettingsHeaderNav";
import DetailsContainer from "@/settings/atoms/DetailsContainer";
import Image from "next/image";
import Link from "next/link";

export default function page() {
  return (
    <div className="w-full flex flex-col gap-10">
      <MobileSettingsHeaderNav title="Overview" />

      <div className="space-y-2">
        <h1>Plan Details</h1>
        <DetailsContainer>
          <div>
            <h2 className="font-bold text-lg md:text-xl">Premium Plan</h2>
            <p>Post unlimited flyers and stories</p>
          </div>

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
