import { getUserProfileDetails } from "@/actions/getUserProfileDetails";
import Higlight from "../molecules/Highlight";
import ContentArea from "../organisms/ContentArea";
import ProfileDetails from "../organisms/ProfileDetails";

export default async function UserAccount() {
  const userData = await getUserProfileDetails();

  return (
    <div className="flex flex-col gap-10">
      <ProfileDetails userData={userData} />
      <Higlight />
      <ContentArea />
    </div>
  );
}
