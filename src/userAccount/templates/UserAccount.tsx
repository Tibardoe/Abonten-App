import Higlight from "../molecules/Highlight";
import ContentArea from "../organisms/ContentArea";
import ProfileDetails from "../organisms/ProfileDetails";

export default function UserAccount() {
  return (
    <div className="flex flex-col gap-10">
      <ProfileDetails />
      <Higlight />
      <ContentArea />
    </div>
  );
}
