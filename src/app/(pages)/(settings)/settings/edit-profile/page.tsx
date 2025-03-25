import MobileSettingsHeaderNav from "@/components/molecules/MobileSettingsHeaderNav";
import EditProfileInputFields from "@/components/organisms/EditProfileInputFields";
import { Button } from "@/components/ui/button";
import Image from "next/image";

export default function page() {
  return (
    <div className="w-full flex flex-col gap-10">
      <MobileSettingsHeaderNav title="Edit Profile" />

      <div className="space-y-16 mb-5">
        <div className="flex justify-between items-center bg-black bg-opacity-5 rounded-xl p-5">
          <div className="flex gap-5 items-center">
            <Image
              src="/assets/images/AnonymousProfile.jpg"
              alt="Profile picture"
              width={40}
              height={40}
              className="w-20 h-20 rounded-full"
            />

            <div>
              <h1 className="font-bold">Big_Ceo</h1>
              <p>Benjamin Tibardoe</p>
            </div>
          </div>

          <Button className="font-bold">Change Photo</Button>
        </div>

        <EditProfileInputFields />
      </div>
    </div>
  );
}
