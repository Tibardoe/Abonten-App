import Higlight from "../molecules/Highlight";
import ContentArea from "../organisms/ContentArea";
import ProfileDetails from "../organisms/ProfileDetails";

export default function UserAccount() {
  return (
    <div className="w-[90%] md:w-[80%] mx-auto pt-24 md:pt-32">
      <div className="flex flex-col gap-10">
        <ProfileDetails />
        <Higlight />
        <ContentArea />
      </div>
    </div>
  );
}
