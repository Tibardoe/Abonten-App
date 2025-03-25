import BackButton from "@/components/atoms/BackButton";
import MobileSettingsHeaderNav from "@/components/molecules/MobileSettingsHeaderNav";
import DetailsContainer from "@/settings/atoms/DetailsContainer";
import Image from "next/image";
import Link from "next/link";

export default function page() {
  return (
    <div className="w-full flex flex-col gap-14">
      <MobileSettingsHeaderNav title="Overview" />

      <div className="space-y-2">
        <h1>Plan Details</h1>
        <DetailsContainer>
          <div>
            <h2 className="font-bold text-xl">Premium Plan</h2>
            <p>Post unlimited flyers and stories</p>
          </div>

          <hr />

          <div className="flex justify-between items-center">
            <p className="font-bold">Manage plan</p>
            <Link href="/settings">
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
            <Link href="#">
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
            <Link href="#">
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
            <p className="font-bold text-lg">View transaction history</p>
            <Link href="#">
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
  );
}
