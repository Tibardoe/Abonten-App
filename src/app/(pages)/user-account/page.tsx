// import { getUserProfileDetails } from "@/actions/getUserProfileDetails";
// import UserAccountLogin from "@/components/organisms/UserAccountLogin";
import { createClient } from "@/config/supabase/server";
// import Higlight from "@/userAccount/molecules/Highlight";
// import ContentArea from "@/userAccount/organisms/ContentArea";
// import ProfileDetails from "@/userAccount/organisms/ProfileDetails";

export default async function page() {
  const supabase = await createClient();

  const { data: user, error } = await supabase.auth.getUser();

  if (error || !user.user) {
    // return <UserAccountLogin />;
  }

  return (
    <div className="flex flex-col gap-7">
      {/* <ProfileDetails /> */}
      {/* <ContentArea /> */}
    </div>
  );
}
