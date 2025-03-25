import MobileSettingsHeaderNav from "@/components/molecules/MobileSettingsHeaderNav";
import DetailsContainer from "@/settings/atoms/DetailsContainer";
import Link from "next/link";
import Image from "next/image";

export default function page() {
  return (
    <div className="w-full flex flex-col gap-10">
      <MobileSettingsHeaderNav title="Membership" />

      <div className="space-y-2">
        <h1>Plan Details</h1>
        <DetailsContainer>
          <div>
            <h2 className="font-bold text-lg md:text-xl">Premium Plan</h2>
            <p>Post unlimited flyers and stories</p>
          </div>

          <hr />

          <div className="flex justify-between items-center">
            <p className="font-bold">Change plan</p>
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
              <p className="font-bold md:text-lg">Next payment</p>
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
        </DetailsContainer>

        <button
          type="button"
          className="w-full text-red-700 font-bold p-3 border border-black rounded-md"
        >
          Cancel Membership
        </button>
      </div>
    </div>
  );
}
